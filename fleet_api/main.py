import json
import logging
import os
import time
import uuid
from datetime import datetime, timezone

from fastapi import Depends, FastAPI, HTTPException, Request, Response
from sqlalchemy import text
from sqlalchemy.orm import Session

from .db import Base, SessionLocal, engine, get_db
from .models import Robot, Upload
from .schemas import (
    HeartbeatRequest,
    IngestBatchRequest,
    IngestBatchResponse,
    IngestRequest,
    IngestResponse,
    ProvisionRequest,
    ProvisionResponse,
    UploadCompleteRequest,
    UploadCompleteResponse,
    UploadRequest,
    UploadRequestResponse,
)
from .security import (
    generate_api_key,
    require_enrollment_token,
    require_robot,
)
from .storage import head_bucket, presign_put, put_json, telemetry_key, upload_key

Base.metadata.create_all(bind=engine)

MAX_INGEST_BYTES = int(os.getenv("MAX_INGEST_BYTES", str(1 * 1024 * 1024)))


class _JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        payload = {
            "ts": datetime.fromtimestamp(record.created, tz=timezone.utc).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "msg": record.getMessage(),
        }
        for key, value in record.__dict__.items():
            if key.startswith("ctx_"):
                payload[key[4:]] = value
        return json.dumps(payload, default=str)


def _configure_logging() -> None:
    handler = logging.StreamHandler()
    handler.setFormatter(_JsonFormatter())
    root = logging.getLogger()
    root.handlers = [handler]
    root.setLevel(os.getenv("LOG_LEVEL", "INFO"))
    for name in ("uvicorn", "uvicorn.access", "uvicorn.error"):
        lg = logging.getLogger(name)
        lg.handlers = [handler]
        lg.propagate = False


_configure_logging()
logger = logging.getLogger("fleet_api")

app = FastAPI(title="Fleet API", version="0.1.0")


@app.middleware("http")
async def limit_and_log(request: Request, call_next):
    if request.url.path.startswith("/v1/data/ingest"):
        cl = request.headers.get("content-length")
        if cl is not None and cl.isdigit() and int(cl) > MAX_INGEST_BYTES:
            return Response(status_code=413, content="Payload too large")

    request_id = request.headers.get("x-request-id") or uuid.uuid4().hex
    start = time.perf_counter()
    try:
        response = await call_next(request)
        status_code = response.status_code
    except Exception:
        logger.exception(
            "request failed",
            extra={
                "ctx_request_id": request_id,
                "ctx_route": request.url.path,
                "ctx_method": request.method,
                "ctx_robot_id": request.headers.get("x-robot-id"),
            },
        )
        raise
    latency_ms = round((time.perf_counter() - start) * 1000, 2)
    logger.info(
        "request",
        extra={
            "ctx_request_id": request_id,
            "ctx_route": request.url.path,
            "ctx_method": request.method,
            "ctx_status": status_code,
            "ctx_latency_ms": latency_ms,
            "ctx_robot_id": request.headers.get("x-robot-id"),
        },
    )
    response.headers["x-request-id"] = request_id
    return response


@app.get("/health")
def health():
    return {"ok": True}


@app.get("/ready")
def ready():
    checks: dict[str, str] = {}
    ok = True

    db = SessionLocal()
    try:
        db.execute(text("SELECT 1"))
        checks["db"] = "ok"
    except Exception as e:
        checks["db"] = f"error: {type(e).__name__}"
        ok = False
    finally:
        db.close()

    try:
        head_bucket()
        checks["s3"] = "ok"
    except Exception as e:
        checks["s3"] = f"error: {type(e).__name__}"
        ok = False

    body = {"ok": ok, "checks": checks}
    return body if ok else Response(
        status_code=503, content=json.dumps(body), media_type="application/json"
    )


@app.post("/v1/robots/provision", response_model=ProvisionResponse)
def provision_robot(
    body: ProvisionRequest,
    db: Session = Depends(get_db),
    enrollment=Depends(require_enrollment_token),
):
    plaintext, key_hash = generate_api_key()
    robot = Robot(
        fleet_id=enrollment.fleet_id,
        api_key_hash=key_hash,
        mac_address=body.mac_address,
        hostname=body.hostname,
        sdk_version=body.sdk_version,
    )
    db.add(robot)
    db.commit()
    db.refresh(robot)
    return ProvisionResponse(robot_id=str(robot.id), api_key=plaintext)


def _check_robot_id_match(body_robot_id: str, robot: Robot):
    if str(robot.id) != body_robot_id:
        raise HTTPException(status_code=403, detail="robot_id mismatch")


@app.post("/v1/data/ingest", response_model=IngestResponse)
def ingest(
    body: IngestRequest,
    robot: Robot = Depends(require_robot),
):
    _check_robot_id_match(body.robot_id, robot)
    key = telemetry_key(str(robot.id), body.stream)
    put_json(
        key,
        {
            "robot_id": str(robot.id),
            "stream": body.stream,
            "timestamp": body.timestamp,
            "data": body.data,
        },
    )
    return IngestResponse(s3_key=key)


@app.post("/v1/data/ingest/batch", response_model=IngestBatchResponse)
def ingest_batch(
    body: IngestBatchRequest,
    robot: Robot = Depends(require_robot),
):
    _check_robot_id_match(body.robot_id, robot)
    key = telemetry_key(str(robot.id), body.stream)
    put_json(
        key,
        {
            "robot_id": str(robot.id),
            "stream": body.stream,
            "timestamp": body.timestamp,
            "records": body.records,
        },
    )
    return IngestBatchResponse(s3_key=key, count=len(body.records))


@app.post("/v1/uploads/request", response_model=UploadRequestResponse)
def request_upload(
    body: UploadRequest,
    db: Session = Depends(get_db),
    robot: Robot = Depends(require_robot),
):
    _check_robot_id_match(body.robot_id, robot)
    key = upload_key(str(robot.id), body.stream, body.filename)
    upload = Upload(
        robot_id=robot.id,
        stream=body.stream,
        filename=body.filename,
        s3_key=key,
        file_size=body.file_size,
        upload_metadata=body.metadata,
    )
    db.add(upload)
    db.commit()
    db.refresh(upload)
    url, content_type = presign_put(key, body.content_type)
    return UploadRequestResponse(
        upload_id=str(upload.id),
        presigned_url=url,
        s3_key=key,
        content_type=content_type,
    )


@app.post("/v1/uploads/{upload_id}/complete", response_model=UploadCompleteResponse)
def complete_upload(
    upload_id: str,
    body: UploadCompleteRequest,
    db: Session = Depends(get_db),
    robot: Robot = Depends(require_robot),
):
    upload = db.query(Upload).filter(Upload.id == upload_id).first()
    if not upload or upload.robot_id != robot.id:
        raise HTTPException(status_code=404, detail="Upload not found")
    if upload.s3_key != body.s3_key:
        raise HTTPException(status_code=400, detail="s3_key mismatch")
    upload.completed = True
    upload.completed_at = datetime.now(timezone.utc)
    upload.file_size = body.file_size
    db.commit()
    return UploadCompleteResponse(
        upload_id=str(upload.id), s3_key=upload.s3_key, completed=True
    )


@app.post("/v1/robots/{robot_id}/heartbeat")
def heartbeat(
    robot_id: str,
    body: HeartbeatRequest,
    db: Session = Depends(get_db),
    robot: Robot = Depends(require_robot),
):
    if str(robot.id) != robot_id:
        raise HTTPException(status_code=403, detail="robot_id mismatch")
    robot.last_seen_at = datetime.now(timezone.utc)
    db.commit()
    return {"ok": True}
