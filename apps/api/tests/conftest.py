import pytest
from fastapi.testclient import TestClient


def fake_mp4(size: int = 64) -> bytes:
    """Minimal bytes with MP4 ftyp box header for content validation."""
    header = b"\x00\x00\x00\x1cftypisom\x00\x00\x00\x00isomavc1"
    return header + b"\x00" * max(0, size - len(header))


@pytest.fixture
def client(tmp_path, monkeypatch):
    db_path = tmp_path / "topolog-test.db"
    data_dir = tmp_path / "data"

    monkeypatch.setenv("TOPOLOG_DATABASE_URL", f"sqlite+aiosqlite:///{db_path}")
    monkeypatch.setenv("TOPOLOG_DATA_DIR", str(data_dir))
    monkeypatch.setenv("TOPOLOG_PIPELINE_START_DELAY_SECONDS", "0.01")
    monkeypatch.setenv("TOPOLOG_PIPELINE_STAGE_DURATION_SECONDS", "0.01")
    monkeypatch.setenv("TOPOLOG_PIPELINE_MODE", "fake")
    monkeypatch.delenv("TOPOLOG_CORS_ORIGINS", raising=False)

    from app.db import reset_engine

    reset_engine()

    from app.main import create_app

    app = create_app()
    with TestClient(app) as test_client:
        yield test_client

    reset_engine()
