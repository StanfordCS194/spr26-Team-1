from datetime import datetime, timezone
from pathlib import Path

from . import models, schemas


def display_name_from_filename(filename: str) -> str:
    return Path(filename).stem


def _utc(dt: datetime | None) -> datetime | None:
    """Ensure a datetime has UTC timezone info (SQLite strips it)."""
    if dt is None:
        return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt


def build_job_response(job: models.Job) -> schemas.JobResponse:
    return schemas.JobResponse(
        id=job.id,
        filename=job.filename,
        fileSize=job.file_size,
        quality=job.quality,
        outputFormats=job.output_formats,
        status=job.status,
        stages=[schemas.StageResponse.model_validate(stage) for stage in job.stages],
        currentStageIndex=job.current_stage_index,
        errorCode=job.error_code,
        errorMessage=job.error_message,
        createdAt=_utc(job.created_at),
        completedAt=_utc(job.completed_at),
        sceneId=job.scene_id,
    )


def build_artifact_response(
    artifact: models.Artifact, base_url: str
) -> schemas.ArtifactResponse:
    clean_base = base_url.rstrip("/")
    return schemas.ArtifactResponse(
        id=artifact.id,
        format=artifact.format,
        filename=artifact.filename,
        sizeBytes=artifact.size_bytes,
        downloadUrl=f"{clean_base}/artifacts/{artifact.id}",
        createdAt=_utc(artifact.created_at),
    )


def _compute_progress(status: str, job: "models.Job | None") -> float:
    if status == schemas.JobStatus.complete.value:
        return 100.0
    if status in (
        schemas.JobStatus.failed.value,
        schemas.JobStatus.cancelled.value,
        schemas.JobStatus.queued.value,
    ):
        return 0.0
    if job and job.stages:
        completed = sum(
            1
            for s in job.stages
            if s.get("status") == schemas.StageStatus.complete.value
        )
        return round((completed / len(job.stages)) * 100, 1)
    return 0.0


def build_scene_summary(
    scene: models.Scene,
    latest_job: "models.Job | None" = None,
    base_url: str | None = None,
) -> schemas.SceneSummary:
    clean_base = base_url.rstrip("/") if base_url else None
    return schemas.SceneSummary(
        sceneId=scene.id,
        displayName=scene.display_name,
        latestVersion=scene.latest_version,
        latestJobId=scene.latest_job_id or "",
        latestJobStatus=scene.latest_job_status,
        progressPercent=_compute_progress(scene.latest_job_status, latest_job),
        thumbnailUrl=f"{clean_base}/scenes/{scene.id}/thumbnail"
        if clean_base
        else None,
        createdAt=_utc(scene.created_at),
        completedAt=_utc(scene.completed_at),
    )


def build_scene_detail(
    scene: models.Scene,
    artifacts: list[models.Artifact],
    base_url: str,
) -> schemas.SceneDetail:
    stats_payload = dict(scene.stats or {})
    quality_payload = dict(scene.quality_metrics or {})
    sim_mp4_artifact_id = quality_payload.pop(
        "simMp4ArtifactId", None
    ) or stats_payload.pop("simMp4ArtifactId", None)

    return schemas.SceneDetail(
        sceneId=scene.id,
        displayName=scene.display_name,
        latestVersion=scene.latest_version,
        quality=scene.quality,
        filename=scene.filename,
        fileSize=scene.file_size,
        latestJobId=scene.latest_job_id or "",
        latestJobStatus=scene.latest_job_status,
        qualityMetrics=schemas.QualityMetrics.model_validate(quality_payload),
        stats=schemas.SceneStats.model_validate(stats_payload),
        artifacts=[
            build_artifact_response(artifact, base_url) for artifact in artifacts
        ],
        outputFormats=scene.output_formats,
        simMp4ArtifactId=sim_mp4_artifact_id,
        createdAt=_utc(scene.created_at),
        completedAt=_utc(scene.completed_at),
    )


def build_initial_scene_bundle_manifest(
    scene: models.Scene, job: models.Job
) -> schemas.SceneBundleManifest:
    return schemas.SceneBundleManifest(
        version=1,
        sceneId=scene.id,
        jobId=job.id,
        createdAt=job.created_at,
        capture=schemas.SceneBundleCapture(
            inputFile=scene.filename,
            frameCount=None,
            resolution=None,
            fps=None,
        ),
    )
