import os
import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from fastapi.responses import FileResponse
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from .. import models, schemas, services, storage
from ..db import get_session


router = APIRouter(tags=["scenes"])


@router.get("/scenes", response_model=schemas.SceneListResponse)
async def list_scenes(
    request: Request,
    session: AsyncSession = Depends(get_session),
    offset: int = 0,
    limit: int = 50,
) -> schemas.SceneListResponse:
    count_result = await session.execute(select(func.count(models.Scene.id)))
    total = count_result.scalar() or 0

    result = await session.execute(
        select(models.Scene)
        .order_by(models.Scene.created_at.desc())
        .offset(max(0, offset))
        .limit(min(limit, 100))
    )
    scenes = result.scalars().all()

    job_ids = [s.latest_job_id for s in scenes if s.latest_job_id]
    jobs_by_id: dict[str, models.Job] = {}
    if job_ids:
        jobs_result = await session.execute(
            select(models.Job).where(models.Job.id.in_(job_ids))
        )
        jobs_by_id = {j.id: j for j in jobs_result.scalars().all()}

    summaries = [
        services.build_scene_summary(scene, jobs_by_id.get(scene.latest_job_id), str(request.base_url))
        for scene in scenes
    ]
    return schemas.SceneListResponse(scenes=summaries, total=total)


@router.get("/scenes/{scene_id}", response_model=schemas.SceneDetail)
async def get_scene(
    scene_id: str,
    request: Request,
    session: AsyncSession = Depends(get_session),
) -> schemas.SceneDetail:
    scene = await session.get(models.Scene, scene_id)
    if not scene:
        raise HTTPException(status_code=404, detail=f"Scene {scene_id} not found")

    artifacts_result = await session.execute(
        select(models.Artifact)
        .where(models.Artifact.job_id == scene.latest_job_id)
        .order_by(models.Artifact.created_at.asc())
    )
    artifacts = artifacts_result.scalars().all()
    return services.build_scene_detail(scene, artifacts, str(request.base_url))


@router.get("/scenes/{scene_id}/thumbnail")
async def get_scene_thumbnail(
    scene_id: str,
    session: AsyncSession = Depends(get_session),
) -> FileResponse:
    scene = await session.get(models.Scene, scene_id)
    if not scene or not scene.latest_job_id:
        raise HTTPException(status_code=404, detail=f"Scene {scene_id} not found")

    frame_path = storage.job_workdir(scene.latest_job_id) / "frames" / "000001.png"
    if not frame_path.exists():
        raise HTTPException(status_code=404, detail=f"Thumbnail not available for scene {scene_id}")

    return FileResponse(Path(frame_path), filename=f"{scene.display_name}-thumbnail.png")


@router.post("/scenes/{scene_id}/rerun", response_model=schemas.RerunSceneResponse)
async def rerun_scene(
    scene_id: str,
    request: Request,
    session: AsyncSession = Depends(get_session),
) -> schemas.RerunSceneResponse:
    scene = await session.get(models.Scene, scene_id)
    if not scene:
        raise HTTPException(status_code=404, detail=f"Scene {scene_id} not found")

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

    previous_job_id = scene.latest_job_id
    job_id = str(uuid.uuid4())
    workdir = storage.ensure_job_workdir(job_id)

    scene.latest_version += 1
    scene.latest_job_id = job_id
    scene.latest_job_status = schemas.JobStatus.queued.value
    scene.quality_metrics = {}
    scene.stats = {}
    scene.completed_at = None

    job = models.Job(
        id=job_id,
        scene_id=scene.id,
        filename=scene.filename,
        file_size=scene.file_size,
        quality=scene.quality,
        output_formats=list(scene.output_formats),
        status=schemas.JobStatus.queued.value,
        current_stage_index=0,
        stages=schemas.build_default_stages(),
        workdir_path=str(workdir),
    )

    session.add(job)
    await session.commit()

    if previous_job_id:
        storage.copy_input_file(previous_job_id, job_id, scene.filename)
    else:
        storage.save_input_file(job_id, scene.filename, b"")

    storage.write_json(
        storage.scene_bundle_manifest_path(job_id),
        services.build_initial_scene_bundle_manifest(scene, job),
    )
    request.app.state.pipeline.schedule_job(job_id)
    return schemas.RerunSceneResponse(jobId=job_id)


@router.delete("/scenes/{scene_id}", status_code=204)
async def delete_scene(
    scene_id: str,
    request: Request,
    session: AsyncSession = Depends(get_session),
) -> Response:
    scene = await session.get(models.Scene, scene_id)
    if not scene:
        return Response(status_code=204)

    jobs_result = await session.execute(select(models.Job).where(models.Job.scene_id == scene_id))
    jobs = jobs_result.scalars().all()

    for job in jobs:
        request.app.state.pipeline.cancel_job(job.id)
        storage.remove_job_workdir(job.id)

    await session.execute(delete(models.Artifact).where(models.Artifact.scene_id == scene_id))
    await session.execute(delete(models.Job).where(models.Job.scene_id == scene_id))
    await session.execute(delete(models.Scene).where(models.Scene.id == scene_id))
    await session.commit()
    return Response(status_code=204)
