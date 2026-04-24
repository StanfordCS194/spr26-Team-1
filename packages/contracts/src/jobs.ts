import { z } from "zod"
import {
  JobStatusSchema,
  StageStatusSchema,
  StageNameSchema,
  QualityPresetSchema,
  OutputFormatSchema,
  ErrorCodeSchema,
} from "./enums"

// ── Stage within a job ────────────────────────────────────────────────────────

export const StageSchema = z.object({
  name: StageNameSchema,
  status: StageStatusSchema,
  startedAt: z.string().datetime().nullish(),
  completedAt: z.string().datetime().nullish(),
  estimatedDurationMinutes: z.number(),
})
export type Stage = z.infer<typeof StageSchema>

// ── Create job request ────────────────────────────────────────────────────────

export const CreateJobRequestSchema = z.object({
  filename: z.string().min(1),
  fileSize: z.number().int().positive(),
  quality: QualityPresetSchema,
  outputFormats: z.array(OutputFormatSchema).min(1),
})
export type CreateJobRequest = z.infer<typeof CreateJobRequestSchema>

// ── Job response (GET /jobs/:id) ──────────────────────────────────────────────

export const JobResponseSchema = z.object({
  id: z.string().uuid(),
  filename: z.string(),
  fileSize: z.number(),
  quality: QualityPresetSchema,
  outputFormats: z.array(OutputFormatSchema).min(1),
  status: JobStatusSchema,
  stages: z.array(StageSchema).min(1),
  currentStageIndex: z.number().int().min(0),
  errorCode: ErrorCodeSchema.nullish(),
  errorMessage: z.string().nullish(),
  createdAt: z.string().datetime(),
  completedAt: z.string().datetime().nullish(),
  sceneId: z.string().uuid().nullish(),
})
export type JobResponse = z.infer<typeof JobResponseSchema>

// ── Job create response ───────────────────────────────────────────────────────

export const CreateJobResponseSchema = z.object({
  id: z.string().uuid(),
  sceneId: z.string().uuid(),
})
export type CreateJobResponse = z.infer<typeof CreateJobResponseSchema>
