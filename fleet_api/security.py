from __future__ import annotations

import hashlib
import secrets

from fastapi import Depends, Header, HTTPException, status
from sqlalchemy.orm import Session

from .db import get_db
from .models import EnrollmentToken, Robot


def hash_secret(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def generate_api_key() -> tuple[str, str]:
    """Returns (plaintext, hash). Plaintext is shown to the robot once."""
    plaintext = "rk_" + secrets.token_urlsafe(32)
    return plaintext, hash_secret(plaintext)


def _bearer(authorization: str | None) -> str:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing or malformed Authorization header",
        )
    return authorization.split(" ", 1)[1].strip()


def require_enrollment_token(
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> EnrollmentToken:
    token = _bearer(authorization)
    et = (
        db.query(EnrollmentToken)
        .filter(EnrollmentToken.token == token, EnrollmentToken.revoked.is_(False))
        .first()
    )
    if not et:
        raise HTTPException(status_code=401, detail="Invalid enrollment token")
    return et


def require_robot(
    authorization: str | None = Header(default=None),
    x_robot_id: str | None = Header(default=None, alias="X-Robot-ID"),
    db: Session = Depends(get_db),
) -> Robot:
    api_key = _bearer(authorization)
    if not x_robot_id:
        raise HTTPException(status_code=401, detail="Missing X-Robot-ID header")

    robot = db.query(Robot).filter(Robot.id == x_robot_id).first()
    if not robot or robot.api_key_hash != hash_secret(api_key):
        raise HTTPException(status_code=401, detail="Invalid robot credentials")
    return robot
