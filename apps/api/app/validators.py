import json
from enum import Enum
from pathlib import Path

from . import storage


class ErrorCode(str, Enum):
    """Canonical error codes surfaced in job.errorCode."""

    mesh_missing = "mesh_missing"
    mesh_glb_missing = "mesh_glb_missing"
    mjcf_missing = "mjcf_missing"
    mjcf_validation_missing = "mjcf_validation_missing"
    mjcf_invalid = "mjcf_invalid"
    mujoco_load_failed = "mujoco_load_failed"
    mujoco_step_unstable = "mujoco_step_unstable"
    invalid_pipeline_mode = "invalid_pipeline_mode"
    pipeline_error = "pipeline_error"
    stage_retry = "stage_retry"
    pose_estimation_command_failed = "pose_estimation_command_failed"
    gaussian_training_command_failed = "gaussian_training_command_failed"
    mesh_extraction_command_failed = "mesh_extraction_command_failed"
    mjcf_preparation_command_failed = "mjcf_preparation_command_failed"
    artifact_export_command_failed = "artifact_export_command_failed"
    mesh_hygiene_failed = "mesh_hygiene_failed"
    mjcf_validation_failed = "mjcf_validation_failed"
    mp4_render_failed = "mp4_render_failed"
    psnr_eval_failed = "psnr_eval_failed"


class ValidationError(RuntimeError):
    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code
        self.message = message


def _ensure_file(path: Path, code: str) -> None:
    if not path.exists():
        raise ValidationError(code, f"Missing required file: {path}")
    if path.is_file() and path.stat().st_size <= 0:
        raise ValidationError(code, f"Empty required file: {path}")


def validate_geometry_outputs(job_id: str) -> dict[str, int | bool]:
    obj_path = storage.ensure_job_workdir(job_id) / "mesh" / "scene.obj"
    glb_path = storage.ensure_job_workdir(job_id) / "mesh" / "scene.glb"
    _ensure_file(obj_path, "mesh_missing")
    _ensure_file(glb_path, "mesh_glb_missing")
    return {
        "objSizeBytes": obj_path.stat().st_size,
        "glbSizeBytes": glb_path.stat().st_size,
        "geometryValid": True,
    }


def _hygiene_manifest_path(job_id: str) -> Path:
    return storage.ensure_job_workdir(job_id) / "manifests" / "mesh_hygiene.json"


def validate_mesh_hygiene(job_id: str) -> dict[str, object]:
    """Validate an optional mesh hygiene manifest when one is present."""
    manifest_path = _hygiene_manifest_path(job_id)
    if not manifest_path.exists():
        raise ValidationError(
            ErrorCode.mesh_hygiene_failed.value,
            f"Mesh hygiene manifest missing: {manifest_path}",
        )
    try:
        data = json.loads(manifest_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise ValidationError(
            ErrorCode.mesh_hygiene_failed.value,
            f"Mesh hygiene manifest unreadable ({manifest_path}): {exc}",
        ) from exc

    if not data.get("passed", False):
        gates = data.get("gates") or {}
        raise ValidationError(
            ErrorCode.mesh_hygiene_failed.value,
            f"Mesh hygiene gates failed: {gates}",
        )

    gates = data.get("gates")
    if not isinstance(gates, dict):
        raise ValidationError(
            ErrorCode.mesh_hygiene_failed.value,
            f"Mesh hygiene manifest missing 'gates' dict: {manifest_path}",
        )
    return gates


def validate_sim_outputs(job_id: str) -> dict[str, int | bool]:
    """Validate MJCF output and optional hygiene metadata."""
    xml_path = storage.ensure_job_workdir(job_id) / "sim" / "scene.xml"
    validation_path = storage.ensure_job_workdir(job_id) / "sim" / "validation.json"
    _ensure_file(xml_path, "mjcf_missing")
    _ensure_file(validation_path, "mjcf_validation_missing")

    xml_text = xml_path.read_text(encoding="utf-8")
    if "<mujoco" not in xml_text:
        raise ValidationError(
            "mjcf_invalid", "MuJoCo XML does not contain a <mujoco> root element"
        )

    validation_data = json.loads(validation_path.read_text(encoding="utf-8"))
    if not validation_data.get("mujocoLoadSuccess", False):
        raise ValidationError(
            "mujoco_load_failed", "MuJoCo validation reported a failed load"
        )
    if validation_data.get("simulationStable") is False:
        raise ValidationError(
            "mujoco_step_unstable",
            "MuJoCo validation reported unstable physics stepping",
        )

    metrics: dict[str, int | bool] = {
        "xmlSizeBytes": xml_path.stat().st_size,
        "mujocoLoadSuccess": True,
    }
    for key in ("simulationStable", "nbody", "ngeom"):
        value = validation_data.get(key)
        if value is not None:
            metrics[key] = value

    if _hygiene_manifest_path(job_id).exists():
        gates = validate_mesh_hygiene(job_id)
        if not gates.get("mujocoStable", False):
            raise ValidationError(
                ErrorCode.mesh_hygiene_failed.value,
                "Mesh hygiene reports mujocoStable=False — MJCF blocked",
            )
        metrics["mjcfValid"] = True

    return metrics


def validate_requested_artifacts(
    job_id: str, formats: list[str]
) -> dict[str, int | bool]:
    for fmt in formats:
        _ensure_file(
            storage.artifact_storage_path(job_id, fmt), ErrorCode.pipeline_error.value
        )
    return {"artifactCount": len(formats), "artifactsValid": True}
