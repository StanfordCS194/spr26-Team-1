import { z } from "zod"

// ── Job & stage status enums ──────────────────────────────────────────────────

export const JobStatusSchema = z.enum([
  "queued",
  "running",
  "complete",
  "failed",
  "cancelled",
])
export type JobStatus = z.infer<typeof JobStatusSchema>

export const StageStatusSchema = z.enum(["pending", "running", "complete", "failed"])
export type StageStatus = z.infer<typeof StageStatusSchema>

// ── Pipeline stage identifiers (machine names) ───────────────────────────────

export const StageNameSchema = z.enum([
  "pose_estimation",
  "gaussian_training",
  "mesh_extraction",
  "mjcf_preparation",
  "artifact_export",
])
export type StageName = z.infer<typeof StageNameSchema>

export const STAGE_LABELS: Record<StageName, string> = {
  pose_estimation: "Pose estimation",
  gaussian_training: "Reconstruction",
  mesh_extraction: "Mesh extraction",
  mjcf_preparation: "Physics prep",
  artifact_export: "Export",
}

// ── Quality presets ───────────────────────────────────────────────────────────

export const QualityPresetSchema = z.enum(["fast", "balanced", "high"])
export type QualityPreset = z.infer<typeof QualityPresetSchema>

// ── Output formats ────────────────────────────────────────────────────────────

export const OutputFormatSchema = z.enum(["MJCF", "GLB", "PLY", "MP4"])
export type OutputFormat = z.infer<typeof OutputFormatSchema>

// ── Error codes ──────────────────────────────────────────────────────────────

export const ErrorCodeSchema = z.enum([
  "mesh_missing",
  "mesh_glb_missing",
  "mjcf_missing",
  "mjcf_validation_missing",
  "mjcf_invalid",
  "mujoco_load_failed",
  "mujoco_step_unstable",
  "invalid_pipeline_mode",
  "pipeline_error",
  "stage_retry",
  "pose_estimation_command_failed",
  "gaussian_training_command_failed",
  "mesh_extraction_command_failed",
  "mjcf_preparation_command_failed",
  "artifact_export_command_failed",
  "mesh_hygiene_failed",
  "mjcf_validation_failed",
  "mp4_render_failed",
  "psnr_eval_failed",
])
export type ErrorCode = z.infer<typeof ErrorCodeSchema>
