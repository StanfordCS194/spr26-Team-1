import json
import os
import uuid
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from .. import models, schemas, services, storage
from ..db import get_session


router = APIRouter(tags=["jobs"])

MAX_UPLOAD_SIZE = 2 * 1024 * 1024 * 1024  # 2 GB
ACCEPTED_VIDEO_EXTENSIONS = {".mp4", ".mov", ".avi"}

def _looks_like_video(data: bytes) -> bool:
    if len(data) < 12:
        return False
    if data[4:8] == b"ftyp":
        return True
    if data[:4] == b"RIFF" and data[8:12] == b"AVI ":
        return True
    return False


def _parse_output_formats(raw_values: list[Any]) -> list[str]:
    if not raw_values:
        return []

    if len(raw_values) == 1:
        raw = raw_values[0]
        if isinstance(raw, str):
            value = raw.strip()
            if value.startswith("["):
                try:
                    decoded = json.loads(value)
                    if isinstance(decoded, list):
                        return [str(item) for item in decoded]
                except (json.JSONDecodeError, ValueError):
                    pass
            if "," in value:
                return [item.strip() for item in value.split(",") if item.strip()]

    return [str(item) for item in raw_values if str(item).strip()]


async def _parse_create_job_request(request: Request) -> tuple[schemas.CreateJobRequest, bytes | None]:
    content_type = request.headers.get("content-type", "")

    if "multipart/form-data" in content_type:
        form = await request.form()
        upload = form.get("file")
        file_bytes = None
        filename = form.get("filename")

        if upload is not None and hasattr(upload, "read"):
            file_bytes = await upload.read()
            filename = filename or getattr(upload, "filename", None)

        raw_size = form.get("fileSize")
        if raw_size is None and file_bytes is not None:
            raw_size = len(file_bytes)

        payload = schemas.CreateJobRequest(
            filename=filename or "",
            fileSize=int(raw_size or 0),
            quality=form.get("quality"),
            outputFormats=_parse_output_formats(form.getlist("outputFormats")),
        )
        return payload, file_bytes

    payload = schemas.CreateJobRequest.model_validate(await request.json())
    return payload, None


@router.post("/jobs", response_model=schemas.CreateJobResponse)
async def create_job(
    request: Request,
    session: AsyncSession = Depends(get_session),
) -> schemas.CreateJobResponse:
    payload, file_bytes = await _parse_create_job_request(request)

    ext = "." + payload.filename.rsplit(".", 1)[-1].lower() if "." in payload.filename else ""
    if ext not in ACCEPTED_VIDEO_EXTENSIONS:
        raise HTTPException(status_code=422, detail=f"Unsupported file type '{ext}'. Accepted: MP4, MOV, AVI.")

    effective_size = len(file_bytes) if file_bytes else payload.fileSize
    if effective_size > MAX_UPLOAD_SIZE:
        raise HTTPException(status_code=413, detail="File exceeds the 2 GB upload limit.")

    if file_bytes and len(file_bytes) >= 12 and not _looks_like_video(file_bytes):
        raise HTTPException(status_code=422, detail="Uploaded file does not appear to be a valid video. Expected MP4, MOV, or AVI content.")

    max_concurrent = int(os.environ.get("TOPOLOG_MAX_CONCURRENT_JOBS", "10"))
    active_count_result = await session.execute(
        select(func.count(models.Job.id)).where(
            models.Job.status.in_(["queued", "running"])
        )
    )
    active_count = active_count_result.scalar() or 0
    if active_count >= max_concurrent:
        raise HTTPException(
            status_code=429,
            detail=f"Too many active jobs ({active_count}). Maximum concurrent jobs: {max_concurrent}.",
        )

    job_id = str(uuid.uuid4())
    scene_id = str(uuid.uuid4())
    workdir = storage.ensure_job_workdir(job_id)

    scene = models.Scene(
        id=scene_id,
        display_name=services.display_name_from_filename(payload.filename),
        latest_version=1,
        latest_job_id=job_id,
        latest_job_status=schemas.JobStatus.queued.value,
        quality=payload.quality.value,
        filename=payload.filename,
        file_size=payload.fileSize,
        output_formats=[fmt.value for fmt in payload.outputFormats],
        quality_metrics={},
        stats={},
    )
    job = models.Job(
        id=job_id,
        scene_id=scene_id,
        filename=payload.filename,
        file_size=payload.fileSize,
        quality=payload.quality.value,
        output_formats=[fmt.value for fmt in payload.outputFormats],
        status=schemas.JobStatus.queued.value,
        current_stage_index=0,
        stages=schemas.build_default_stages(),
        workdir_path=str(workdir),
    )

    session.add_all([scene, job])
    await session.commit()

    storage.save_input_file(job_id, payload.filename, file_bytes)
    storage.write_json(
        storage.scene_bundle_manifest_path(job_id),
        services.build_initial_scene_bundle_manifest(scene, job),
    )
    request.app.state.pipeline.schedule_job(job_id)
    return schemas.CreateJobResponse(id=job_id, sceneId=scene_id)


@router.get("/jobs", tags=["jobs"])
async def list_jobs(
    session: AsyncSession = Depends(get_session),
    status: str | None = None,
    offset: int = 0,
    limit: int = 50,
) -> dict:
    from sqlalchemy import select as sa_select

    query = sa_select(models.Job)
    if status:
        query = query.where(models.Job.status == status)
    query = query.order_by(models.Job.created_at.desc()).offset(max(0, offset)).limit(min(limit, 100))

    count_query = sa_select(func.count(models.Job.id))
    if status:
        count_query = count_query.where(models.Job.status == status)
    total = (await session.execute(count_query)).scalar() or 0

    result = await session.execute(query)
    jobs = result.scalars().all()
    return {"jobs": [services.build_job_response(j) for j in jobs], "total": total}


@router.get("/jobs/{job_id}", response_model=schemas.JobResponse)
async def get_job(job_id: str, session: AsyncSession = Depends(get_session)) -> schemas.JobResponse:
    job = await session.get(models.Job, job_id)
    if not job:
        raise HTTPException(status_code=404, detail=f"Job {job_id} not found")
    return services.build_job_response(job)


@router.post("/jobs/{job_id}/cancel")
async def cancel_job(
    job_id: str,
    request: Request,
    session: AsyncSession = Depends(get_session),
) -> dict[str, str]:
    job = await session.get(models.Job, job_id)
    if not job:
        raise HTTPException(status_code=404, detail=f"Job {job_id} not found")
    if job.status in (schemas.JobStatus.complete.value, schemas.JobStatus.failed.value, schemas.JobStatus.cancelled.value):
        return {"status": job.status}

    request.app.state.pipeline.cancel_job(job_id)
    job.status = schemas.JobStatus.cancelled.value
    scene = await session.get(models.Scene, job.scene_id)
    if scene and scene.latest_job_id == job_id:
        scene.latest_job_status = schemas.JobStatus.cancelled.value
    await session.commit()
    return {"status": "cancelled"}
