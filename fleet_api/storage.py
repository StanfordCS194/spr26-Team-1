import json
import uuid
from datetime import datetime, timezone

import boto3

from .config import settings

_s3 = boto3.client(
    "s3",
    region_name=settings.AWS_REGION,
    endpoint_url=settings.S3_ENDPOINT_URL,
)


def robot_prefix(robot_id: str) -> str:
    return f"robots/{robot_id}"


def telemetry_key(robot_id: str, stream: str) -> str:
    ts = datetime.now(timezone.utc)
    return (
        f"{robot_prefix(robot_id)}/{stream}/"
        f"{ts.strftime('%Y/%m/%d')}/{ts.strftime('%H%M%S')}-{uuid.uuid4().hex}.json"
    )


def upload_key(robot_id: str, stream: str, filename: str) -> str:
    ts = datetime.now(timezone.utc)
    return (
        f"{robot_prefix(robot_id)}/{stream}/"
        f"{ts.strftime('%Y/%m/%d')}/{uuid.uuid4().hex}-{filename}"
    )


def put_json(key: str, payload: dict) -> None:
    _s3.put_object(
        Bucket=settings.S3_BUCKET,
        Key=key,
        Body=json.dumps(payload).encode("utf-8"),
        ContentType="application/json",
    )


def presign_put(key: str, content_type: str = "application/octet-stream") -> tuple[str, str]:
    """Returns (url, content_type). The PUT must send Content-Type matching the returned value."""
    url = _s3.generate_presigned_url(
        "put_object",
        Params={
            "Bucket": settings.S3_BUCKET,
            "Key": key,
            "ContentType": content_type,
        },
        ExpiresIn=settings.PRESIGN_EXPIRY_SECONDS,
    )
    return url, content_type


def head_bucket() -> None:
    _s3.head_bucket(Bucket=settings.S3_BUCKET)
