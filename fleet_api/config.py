from __future__ import annotations

import os


class Settings:
    DATABASE_URL: str = os.getenv(
        "DATABASE_URL",
        "postgresql+psycopg2://fleet:fleet@localhost:5432/fleet",
    )

    AWS_REGION: str = os.getenv("AWS_REGION", "us-east-1")
    S3_BUCKET: str = os.getenv("S3_BUCKET", "fleet-robot-data")
    S3_ENDPOINT_URL: str | None = os.getenv("S3_ENDPOINT_URL") or None

    PRESIGN_EXPIRY_SECONDS: int = int(os.getenv("PRESIGN_EXPIRY_SECONDS", "3600"))


settings = Settings()
