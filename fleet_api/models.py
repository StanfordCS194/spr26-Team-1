import uuid
from datetime import datetime, timezone

from sqlalchemy import (
    BigInteger,
    Boolean,
    Column,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import relationship

from .db import Base


def _utcnow():
    return datetime.now(timezone.utc)


class Fleet(Base):
    __tablename__ = "fleets"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String(255), nullable=False)
    created_at = Column(DateTime(timezone=True), default=_utcnow, nullable=False)

    enrollment_tokens = relationship("EnrollmentToken", back_populates="fleet")
    robots = relationship("Robot", back_populates="fleet")


class EnrollmentToken(Base):
    __tablename__ = "enrollment_tokens"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    fleet_id = Column(UUID(as_uuid=True), ForeignKey("fleets.id"), nullable=False)
    token = Column(String(128), unique=True, nullable=False, index=True)
    revoked = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime(timezone=True), default=_utcnow, nullable=False)

    fleet = relationship("Fleet", back_populates="enrollment_tokens")


class Robot(Base):
    __tablename__ = "robots"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    fleet_id = Column(UUID(as_uuid=True), ForeignKey("fleets.id"), nullable=False)
    api_key_hash = Column(String(128), nullable=False, index=True)
    mac_address = Column(String(64))
    hostname = Column(String(255))
    sdk_version = Column(String(32))
    provisioned_at = Column(DateTime(timezone=True), default=_utcnow, nullable=False)
    last_seen_at = Column(DateTime(timezone=True))

    fleet = relationship("Fleet", back_populates="robots")
    uploads = relationship("Upload", back_populates="robot")


class Upload(Base):
    __tablename__ = "uploads"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    robot_id = Column(UUID(as_uuid=True), ForeignKey("robots.id"), nullable=False)
    stream = Column(String(128), nullable=False)
    filename = Column(String(512), nullable=False)
    s3_key = Column(Text, nullable=False)
    file_size = Column(BigInteger)
    upload_metadata = Column(JSONB)
    completed = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime(timezone=True), default=_utcnow, nullable=False)
    completed_at = Column(DateTime(timezone=True))

    robot = relationship("Robot", back_populates="uploads")
