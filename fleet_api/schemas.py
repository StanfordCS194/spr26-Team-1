from typing import Any, Optional

from pydantic import BaseModel, Field


class ProvisionRequest(BaseModel):
    mac_address: Optional[str] = None
    hostname: Optional[str] = None
    sdk_version: Optional[str] = None


class ProvisionResponse(BaseModel):
    robot_id: str
    api_key: str


class IngestRequest(BaseModel):
    robot_id: str
    stream: str = "default"
    timestamp: Optional[str] = None
    data: dict[str, Any]


class IngestBatchRequest(BaseModel):
    robot_id: str
    stream: str = "default"
    timestamp: Optional[str] = None
    records: list[dict[str, Any]]


class IngestResponse(BaseModel):
    s3_key: str


class IngestBatchResponse(BaseModel):
    s3_key: str
    count: int


class UploadRequest(BaseModel):
    robot_id: str
    filename: str
    file_size: int = Field(ge=0)
    stream: str = "files"
    content_type: str = "application/octet-stream"
    metadata: dict[str, Any] = {}


class UploadRequestResponse(BaseModel):
    upload_id: str
    presigned_url: str
    s3_key: str
    content_type: str


class UploadCompleteRequest(BaseModel):
    s3_key: str
    file_size: int = Field(ge=0)


class UploadCompleteResponse(BaseModel):
    upload_id: str
    s3_key: str
    completed: bool


class HeartbeatRequest(BaseModel):
    timestamp: Optional[str] = None
