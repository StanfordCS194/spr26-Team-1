from datetime import datetime
from enum import Enum
from typing import Optional

from pydantic import BaseModel, Field, field_validator


class QualityPreset(str, Enum):
    fast = "fast"
    balanced = "balanced"
    high = "high"


class OutputFormat(str, Enum):
    MJCF = "MJCF"
    GLB = "GLB"
    PLY = "PLY"
    MP4 = "MP4"


class JobStatus(str, Enum):
    queued = "queued"
    running = "running"
    complete = "complete"
    failed = "failed"
    cancelled = "cancelled"


class StageStatus(str, Enum):
    pending = "pending"
    running = "running"
    complete = "complete"
    failed = "failed"


class StageName(str, Enum):
    pose_estimation = "pose_estimation"
    gaussian_training = "gaussian_training"
    mesh_extraction = "mesh_extraction"
    mjcf_preparation = "mjcf_preparation"
    artifact_export = "artifact_export"


STAGE_ESTIMATED_MINUTES = {
    StageName.pose_estimation: 5,
    StageName.gaussian_training: 18,
    StageName.mesh_extraction: 5,
    StageName.mjcf_preparation: 2,
    StageName.artifact_export: 1,
}


class StageResponse(BaseModel):
    name: StageName
    status: StageStatus = StageStatus.pending
    startedAt: Optional[datetime] = None
    completedAt: Optional[datetime] = None
    estimatedDurationMinutes: int


class CreateJobRequest(BaseModel):
    filename: str = Field(min_length=1)
    fileSize: int = Field(gt=0)
    quality: QualityPreset
    outputFormats: list[OutputFormat] = Field(min_length=1)


class CreateJobResponse(BaseModel):
    id: str
    sceneId: str


class JobResponse(BaseModel):
    id: str
    filename: str
    fileSize: int
    quality: QualityPreset
    outputFormats: list[OutputFormat]
    status: JobStatus
    stages: list[StageResponse]
    currentStageIndex: int
    errorCode: Optional[str] = None
    errorMessage: Optional[str] = None
    createdAt: datetime
    completedAt: Optional[datetime] = None
    sceneId: Optional[str] = None

    @field_validator("errorCode", mode="before")
    @classmethod
    def _validate_error_code(cls, v: str | None) -> str | None:
        if v is None:
            return v
        from .validators import ErrorCode

        valid = {e.value for e in ErrorCode}
        if v not in valid:
            return "pipeline_error"
        return v


class ArtifactResponse(BaseModel):
    id: str
    format: OutputFormat
    filename: str
    sizeBytes: int
    downloadUrl: str
    createdAt: datetime


class QualityMetrics(BaseModel):
    splatPsnrDb: Optional[float] = None
    meshQualityPercent: Optional[float] = Field(default=None, ge=0, le=100)
    mjcfValid: Optional[bool] = None


class HygieneGates(BaseModel):
    """Optional mesh validation gates."""

    watertight: Optional[bool] = None
    eulerChar: Optional[int] = None
    ccCount: Optional[int] = Field(default=None, ge=0)
    coacdConvexCount: Optional[int] = Field(default=None, ge=0)
    mujocoStable: Optional[bool] = None


class SceneStats(BaseModel):
    gaussianCount: Optional[int] = None
    meshFaces: Optional[int] = None
    collisionHulls: Optional[int] = None
    reconstructionTimeSeconds: Optional[float] = None
    mjcfBodyCount: Optional[int] = None
    mjcfGeomCount: Optional[int] = None
    simulationStable: Optional[bool] = None
    hygieneGates: Optional[HygieneGates] = None


class SceneSummary(BaseModel):
    sceneId: str
    displayName: str
    latestVersion: int
    latestJobId: str
    latestJobStatus: JobStatus
    progressPercent: float = Field(ge=0, le=100)
    thumbnailUrl: Optional[str] = None
    createdAt: datetime
    completedAt: Optional[datetime] = None


class SceneDetail(BaseModel):
    sceneId: str
    displayName: str
    latestVersion: int
    quality: QualityPreset
    filename: str
    fileSize: int
    latestJobId: str
    latestJobStatus: JobStatus
    qualityMetrics: QualityMetrics = QualityMetrics()
    stats: SceneStats = SceneStats()
    artifacts: list[ArtifactResponse] = Field(default_factory=list)
    outputFormats: list[OutputFormat]
    simMp4ArtifactId: Optional[str] = None
    createdAt: datetime
    completedAt: Optional[datetime] = None


class SceneListResponse(BaseModel):
    scenes: list[SceneSummary]
    total: int


class RerunSceneResponse(BaseModel):
    jobId: str


class StageManifest(BaseModel):
    stageName: StageName
    status: StageStatus
    startedAt: datetime
    completedAt: Optional[datetime] = None
    durationSeconds: Optional[float] = None
    inputs: dict[str, str]
    outputs: dict[str, str]
    command: Optional[str] = None
    metrics: dict[str, str | int | float | bool] = Field(default_factory=dict)
    error: Optional[str] = None


class SceneBundleCapture(BaseModel):
    inputFile: str
    frameCount: Optional[int] = None
    resolution: Optional[str] = None
    fps: Optional[float] = None


class SceneBundlePoses(BaseModel):
    registeredFrames: Optional[int] = None
    sparsePoints: Optional[int] = None
    meanReprojError: Optional[float] = None


class SceneBundleSplats(BaseModel):
    gaussianCount: Optional[int] = None
    psnr: Optional[float] = None
    ssim: Optional[float] = None
    trainSteps: Optional[int] = None


class SceneBundleMesh(BaseModel):
    faceCount: Optional[int] = None
    vertexCount: Optional[int] = None


class SceneBundleSim(BaseModel):
    hullCount: Optional[int] = None
    xmlSizeBytes: Optional[int] = None
    mujocoLoadSuccess: Optional[bool] = None
    simulationStable: Optional[bool] = None


class SceneBundleManifest(BaseModel):
    version: int = 1
    sceneId: str
    jobId: str
    createdAt: datetime
    stages: dict[StageName, StageManifest] = Field(default_factory=dict)
    capture: Optional[SceneBundleCapture] = None
    poses: Optional[SceneBundlePoses] = None
    splats: Optional[SceneBundleSplats] = None
    mesh: Optional[SceneBundleMesh] = None
    sim: Optional[SceneBundleSim] = None


def build_default_stages() -> list[dict]:
    return [
        {
            "name": s.value,
            "status": StageStatus.pending.value,
            "startedAt": None,
            "completedAt": None,
            "estimatedDurationMinutes": STAGE_ESTIMATED_MINUTES[s],
        }
        for s in StageName
    ]
