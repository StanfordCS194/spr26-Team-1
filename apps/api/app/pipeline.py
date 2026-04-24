import asyncio
import json
import logging
import os
from datetime import datetime, timezone

from . import models, schemas, services, storage, validators
from .db import get_session_factory

logger = logging.getLogger("topolog.pipeline")


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _ensure_utc(dt: datetime) -> datetime:
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def _duration(stage: dict, completed_at: datetime) -> float | None:
    started_at = stage.get("startedAt")
    if not started_at:
        return None
    return max(
        0.0,
        (completed_at - datetime.fromisoformat(started_at)).total_seconds(),
    )


def _count_obj_faces(job_id: str) -> int:
    obj_path = storage.ensure_job_workdir(job_id) / "mesh" / "scene.obj"
    if not obj_path.exists():
        return 0
    faces = 0
    for line in obj_path.read_text(encoding="utf-8", errors="replace").splitlines():
        if line.startswith("f "):
            faces += 1
    return faces


def _stage_delay_seconds() -> float:
    return float(os.getenv("TOPOLOG_PIPELINE_STAGE_DURATION_SECONDS", "0.2"))


def _start_delay_seconds() -> float:
    return float(os.getenv("TOPOLOG_PIPELINE_START_DELAY_SECONDS", "0.05"))


class FakePipelineManager:
    def __init__(self) -> None:
        self._tasks: dict[str, asyncio.Task[None]] = {}

    def schedule_job(self, job_id: str) -> None:
        existing = self._tasks.get(job_id)
        if existing and not existing.done():
            return
        self._tasks[job_id] = asyncio.create_task(self._run_job(job_id))

    def cancel_job(self, job_id: str) -> None:
        task = self._tasks.get(job_id)
        if task and not task.done():
            task.cancel()

    async def shutdown(self) -> None:
        for task in self._tasks.values():
            if not task.done():
                task.cancel()
        await asyncio.gather(*self._tasks.values(), return_exceptions=True)
        self._tasks.clear()

    async def _run_job(self, job_id: str) -> None:
        try:
            await asyncio.sleep(_start_delay_seconds())
            if not await self._mark_job_running(job_id):
                return

            for stage_name in schemas.StageName:
                started = await self._start_stage(job_id, stage_name)
                if not started:
                    return
                await asyncio.sleep(_stage_delay_seconds())
                completed = await self._complete_stage(job_id, stage_name)
                if not completed:
                    return

            await self._mark_job_complete(job_id)
        except asyncio.CancelledError:
            logger.info("Job %s cancelled", job_id)
        except validators.ValidationError as exc:
            logger.warning("Job %s failed: [%s] %s", job_id, exc.code, exc.message)
            await self._mark_job_failed(job_id, exc.code, exc.message)
        except Exception as exc:
            logger.exception("Job %s unexpected error", job_id)
            await self._mark_job_failed(job_id, "pipeline_error", str(exc))

    async def _mark_job_running(self, job_id: str) -> bool:
        async with get_session_factory()() as session:
            job = await session.get(models.Job, job_id)
            if not job:
                return False
            scene = await session.get(models.Scene, job.scene_id)
            if not scene:
                return False
            job.status = schemas.JobStatus.running.value
            job.error_code = None
            job.error_message = None
            scene.latest_job_status = schemas.JobStatus.running.value
            await session.commit()
            return True

    async def _start_stage(self, job_id: str, stage_name: schemas.StageName) -> bool:
        async with get_session_factory()() as session:
            job = await session.get(models.Job, job_id)
            if not job:
                return False
            stages = [dict(stage) for stage in job.stages]
            stage_index = next(
                (
                    idx
                    for idx, stage in enumerate(stages)
                    if stage["name"] == stage_name.value
                ),
                None,
            )
            if stage_index is None:
                return False
            stages[stage_index]["status"] = schemas.StageStatus.running.value
            stages[stage_index]["startedAt"] = _now().isoformat()
            job.stages = stages
            job.current_stage_index = stage_index
            await session.commit()
            return True

    async def _complete_stage(self, job_id: str, stage_name: schemas.StageName) -> bool:
        async with get_session_factory()() as session:
            job = await session.get(models.Job, job_id)
            if not job:
                return False
            scene = await session.get(models.Scene, job.scene_id)
            if not scene:
                return False

            stages = [dict(stage) for stage in job.stages]
            stage_index = next(
                (
                    idx
                    for idx, stage in enumerate(stages)
                    if stage["name"] == stage_name.value
                ),
                None,
            )
            if stage_index is None:
                return False

            stage = stages[stage_index]
            stage["status"] = schemas.StageStatus.complete.value
            completed_at = _now()
            stage["completedAt"] = completed_at.isoformat()
            job.stages = stages

            stage_manifest = await self._materialize_stage_outputs(
                job, scene, stage_name, stage, completed_at, session
            )
            storage.write_json(
                storage.stage_manifest_path(job.id, stage_name.value),
                stage_manifest,
            )
            self._write_scene_bundle_manifest(job, scene, stage_name, stage_manifest)

            await session.commit()
            return True

    async def _materialize_stage_outputs(
        self,
        job: models.Job,
        scene: models.Scene,
        stage_name: schemas.StageName,
        stage: dict,
        completed_at: datetime,
        session,
    ) -> schemas.StageManifest:
        workdir = storage.ensure_job_workdir(job.id)
        storage.ensure_fake_stage_outputs(job.id)
        input_path = storage.input_file_path(job.id, scene.filename)
        started_at = datetime.fromisoformat(stage["startedAt"])

        if stage_name == schemas.StageName.pose_estimation:
            return schemas.StageManifest(
                stageName=stage_name,
                status=schemas.StageStatus.complete,
                startedAt=started_at,
                completedAt=completed_at,
                durationSeconds=_duration(stage, completed_at),
                inputs={"inputFile": str(input_path)},
                outputs={"posesDir": str(workdir / "poses" / "colmap")},
                command="demo pose extraction",
                metrics={
                    "registeredFrames": 245,
                    "sparsePoints": 18432,
                    "meanReprojError": 0.82,
                },
            )

        if stage_name == schemas.StageName.gaussian_training:
            new_stats = {**(scene.stats or {})}
            new_stats["gaussianCount"] = 2_100_000
            scene.stats = new_stats
            scene.quality_metrics = {
                **(scene.quality_metrics or {}),
                "splatPsnrDb": 28.4,
            }
            return schemas.StageManifest(
                stageName=stage_name,
                status=schemas.StageStatus.complete,
                startedAt=started_at,
                completedAt=completed_at,
                durationSeconds=_duration(stage, completed_at),
                inputs={"posesDir": str(workdir / "poses" / "colmap")},
                outputs={
                    "plyDir": str(workdir / "splats" / "results" / "plys"),
                    "checkpointDir": str(workdir / "splats" / "results" / "ckpts"),
                },
                command="demo splat training",
                metrics={"gaussianCount": 2_100_000, "psnr": 28.4, "trainSteps": 15000},
            )

        if stage_name == schemas.StageName.mesh_extraction:
            geometry_metrics = validators.validate_geometry_outputs(job.id)
            new_stats = {**(scene.stats or {})}
            new_stats["meshFaces"] = max(2_400, _count_obj_faces(job.id))
            new_stats["collisionHulls"] = 16
            scene.stats = new_stats
            scene.quality_metrics = {
                **(scene.quality_metrics or {}),
                "meshQualityPercent": 80,
            }
            return schemas.StageManifest(
                stageName=stage_name,
                status=schemas.StageStatus.complete,
                startedAt=started_at,
                completedAt=completed_at,
                durationSeconds=_duration(stage, completed_at),
                inputs={"ply": str(workdir / "splats" / "results" / "plys" / "point_cloud.ply")},
                outputs={
                    "obj": str(workdir / "mesh" / "scene.obj"),
                    "glb": str(workdir / "mesh" / "scene.glb"),
                },
                command="demo mesh extraction",
                metrics={
                    **geometry_metrics,
                    "faceCount": new_stats["meshFaces"],
                    "meshQualityPercent": 80,
                },
            )

        if stage_name == schemas.StageName.mjcf_preparation:
            sim_metrics = validators.validate_sim_outputs(job.id)
            scene.quality_metrics = {
                **(scene.quality_metrics or {}),
                "mjcfValid": True,
            }
            scene.stats = {
                **(scene.stats or {}),
                "mjcfBodyCount": 2,
                "mjcfGeomCount": 2,
                "simulationStable": True,
            }
            return schemas.StageManifest(
                stageName=stage_name,
                status=schemas.StageStatus.complete,
                startedAt=started_at,
                completedAt=completed_at,
                durationSeconds=_duration(stage, completed_at),
                inputs={"obj": str(workdir / "mesh" / "scene.obj")},
                outputs={
                    "xml": str(workdir / "sim" / "scene.xml"),
                    "validation": str(workdir / "sim" / "validation.json"),
                },
                command="demo mjcf validation",
                metrics={**sim_metrics, "mjcfValid": True, "hullCount": 16},
            )

        artifact_paths: dict[str, str] = {}
        for fmt in scene.output_formats:
            path = storage.artifact_storage_path(job.id, fmt)
            artifact_paths[fmt] = str(path)
            session.add(
                models.Artifact(
                    scene_id=scene.id,
                    job_id=job.id,
                    format=fmt,
                    filename=path.name,
                    size_bytes=path.stat().st_size,
                    storage_path=str(path),
                )
            )
        artifact_metrics = validators.validate_requested_artifacts(
            job.id,
            list(scene.output_formats),
        )
        return schemas.StageManifest(
            stageName=stage_name,
            status=schemas.StageStatus.complete,
            startedAt=started_at,
            completedAt=completed_at,
            durationSeconds=_duration(stage, completed_at),
            inputs={"workdir": str(workdir)},
            outputs=artifact_paths,
            command="artifact publication",
            metrics=artifact_metrics,
        )

    def _write_scene_bundle_manifest(
        self,
        job: models.Job,
        scene: models.Scene,
        stage_name: schemas.StageName,
        stage_manifest: schemas.StageManifest,
    ) -> None:
        bundle_path = storage.scene_bundle_manifest_path(job.id)
        if bundle_path.exists():
            bundle = schemas.SceneBundleManifest.model_validate(
                json.loads(bundle_path.read_text(encoding="utf-8"))
            )
        else:
            bundle = services.build_initial_scene_bundle_manifest(scene, job)

        bundle.stages[stage_name] = stage_manifest
        metrics = stage_manifest.metrics
        if stage_name == schemas.StageName.pose_estimation:
            bundle.poses = schemas.SceneBundlePoses(
                registeredFrames=metrics.get("registeredFrames"),
                sparsePoints=metrics.get("sparsePoints"),
                meanReprojError=metrics.get("meanReprojError"),
            )
        elif stage_name == schemas.StageName.gaussian_training:
            bundle.splats = schemas.SceneBundleSplats(
                gaussianCount=metrics.get("gaussianCount"),
                psnr=metrics.get("psnr"),
                ssim=None,
                trainSteps=metrics.get("trainSteps"),
            )
        elif stage_name == schemas.StageName.mesh_extraction:
            bundle.mesh = schemas.SceneBundleMesh(
                faceCount=metrics.get("faceCount"),
                vertexCount=None,
            )
        elif stage_name == schemas.StageName.mjcf_preparation:
            xml_path = storage.artifact_storage_path(job.id, schemas.OutputFormat.MJCF.value)
            bundle.sim = schemas.SceneBundleSim(
                hullCount=metrics.get("hullCount"),
                xmlSizeBytes=xml_path.stat().st_size if xml_path.exists() else None,
                mujocoLoadSuccess=metrics.get("mujocoLoadSuccess"),
                simulationStable=metrics.get("simulationStable"),
            )

        storage.write_json(bundle_path, bundle)

    async def _mark_job_complete(self, job_id: str) -> None:
        async with get_session_factory()() as session:
            job = await session.get(models.Job, job_id)
            if not job:
                return
            scene = await session.get(models.Scene, job.scene_id)
            if not scene:
                return
            completed_at = _now()
            job.status = schemas.JobStatus.complete.value
            job.completed_at = completed_at
            job.error_code = None
            job.error_message = None
            scene.latest_job_status = schemas.JobStatus.complete.value
            scene.completed_at = completed_at
            created_at = _ensure_utc(job.created_at)
            scene.stats = {
                **(scene.stats or {}),
                "reconstructionTimeSeconds": max(
                    1,
                    int((completed_at - created_at).total_seconds()),
                ),
            }
            await session.commit()

    async def _mark_job_failed(self, job_id: str, error_code: str, error_message: str) -> None:
        async with get_session_factory()() as session:
            job = await session.get(models.Job, job_id)
            if not job:
                return
            scene = await session.get(models.Scene, job.scene_id)
            if not scene:
                return
            stages = [dict(stage) for stage in job.stages]
            current_stage = min(job.current_stage_index, len(stages) - 1)
            if current_stage >= 0:
                stages[current_stage]["status"] = schemas.StageStatus.failed.value
                stages[current_stage]["startedAt"] = stages[current_stage].get("startedAt") or _now().isoformat()
            job.stages = stages
            job.status = schemas.JobStatus.failed.value
            job.error_code = error_code
            job.error_message = error_message
            scene.latest_job_status = schemas.JobStatus.failed.value
            await session.commit()
