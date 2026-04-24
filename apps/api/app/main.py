import json as _json
import logging
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import select

from .db import get_session_factory, init_db
from .pipeline import FakePipelineManager
from .routes.artifacts import router as artifacts_router
from .routes.jobs import router as jobs_router
from .routes.scenes import router as scenes_router
from .storage import get_data_dir


class _JSONFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        entry = {
            "ts": self.formatTime(record),
            "level": record.levelname,
            "logger": record.name,
            "msg": record.getMessage(),
        }
        if record.exc_info and record.exc_info[1]:
            entry["error"] = str(record.exc_info[1])
        return _json.dumps(entry, default=str)


def _configure_logging() -> None:
    handler = logging.StreamHandler()
    handler.setFormatter(_JSONFormatter())
    root = logging.getLogger()
    root.handlers.clear()
    root.addHandler(handler)
    root.setLevel(logging.INFO)


_configure_logging()
logger = logging.getLogger("topolog")

DEFAULT_CORS_ORIGINS = (
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:3001",
    "http://127.0.0.1:3001",
)


def _allowed_cors_origins() -> list[str]:
    raw = os.environ.get("TOPOLOG_CORS_ORIGINS")
    if not raw:
        return list(DEFAULT_CORS_ORIGINS)
    return [origin.strip() for origin in raw.split(",") if origin.strip()]


@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.data_dir = get_data_dir()
    app.state.data_dir.mkdir(parents=True, exist_ok=True)
    await init_db()
    app.state.pipeline = FakePipelineManager()
    logger.info("Topolog API ready (demo pipeline, data_dir=%s)", app.state.data_dir)
    yield
    await app.state.pipeline.shutdown()


def create_app() -> FastAPI:
    app = FastAPI(
        title="Topolog API",
        description=(
            "Dashboard backend for queued video reconstruction jobs. "
            "Upload a video, track staged progress, and download generated artifacts."
        ),
        version="0.1.0",
        lifespan=lifespan,
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=_allowed_cors_origins(),
        allow_credentials=False,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    api_key = os.environ.get("TOPOLOG_API_KEY")
    if api_key:
        import hmac

        expected = f"Bearer {api_key}"

        @app.middleware("http")
        async def check_api_key(request, call_next):
            if request.url.path.startswith("/health"):
                return await call_next(request)
            auth = request.headers.get("Authorization", "")
            if not hmac.compare_digest(auth, expected):
                from fastapi.responses import JSONResponse

                return JSONResponse(
                    status_code=401,
                    content={"detail": "Invalid or missing API key"},
                )
            return await call_next(request)

        logger.info("API key authentication enabled")

    @app.get("/health", tags=["system"])
    async def healthcheck():
        try:
            async with get_session_factory()() as session:
                await session.execute(select(1))
        except Exception:
            from fastapi.responses import JSONResponse

            return JSONResponse(
                status_code=503,
                content={"status": "unhealthy", "detail": "database unreachable"},
            )
        return {"status": "ok"}

    app.include_router(jobs_router)
    app.include_router(scenes_router)
    app.include_router(artifacts_router)
    return app


app = create_app()
