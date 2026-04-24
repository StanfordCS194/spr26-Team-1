import { z } from "zod"
import { JobStatusSchema, QualityPresetSchema, OutputFormatSchema } from "./enums"

// ── Artifact ──────────────────────────────────────────────────────────────────

export const ArtifactSchema = z.object({
  id: z.string().uuid(),
  format: OutputFormatSchema,
  filename: z.string(),
  sizeBytes: z.number().int().positive(),
  downloadUrl: z.string().url(),
  createdAt: z.string().datetime(),
})
export type Artifact = z.infer<typeof ArtifactSchema>

// ── Quality metrics ───────────────────────────────────────────────────────────

export const QualityMetricsSchema = z.object({
  splatPsnrDb: z.number().nullish(),
  meshQualityPercent: z.number().min(0).max(100).nullish(),
  mjcfValid: z.boolean().nullish(),
})
export type QualityMetrics = z.infer<typeof QualityMetricsSchema>

// ── Hygiene gates ─────────────────────────────────────────────────────────────

export const HygieneGatesSchema = z.object({
  watertight: z.boolean().nullish(),
  eulerChar: z.number().int().nullish(),
  ccCount: z.number().int().nonnegative().nullish(),
  coacdConvexCount: z.number().int().nonnegative().nullish(),
  mujocoStable: z.boolean().nullish(),
})
export type HygieneGates = z.infer<typeof HygieneGatesSchema>

// ── Scene stats ───────────────────────────────────────────────────────────────

export const SceneStatsSchema = z.object({
  gaussianCount: z.number().int().nullish(),
  meshFaces: z.number().int().nullish(),
  collisionHulls: z.number().int().nullish(),
  reconstructionTimeSeconds: z.number().nullish(),
  mjcfBodyCount: z.number().int().nullish(),
  mjcfGeomCount: z.number().int().nullish(),
  simulationStable: z.boolean().nullish(),
  hygieneGates: HygieneGatesSchema.nullish(),
})
export type SceneStats = z.infer<typeof SceneStatsSchema>

// ── Scene summary (library cards — GET /scenes) ──────────────────────────────

export const SceneSummarySchema = z.object({
  sceneId: z.string().uuid(),
  displayName: z.string(),
  latestVersion: z.number().int().min(1),
  latestJobId: z.string().uuid(),
  latestJobStatus: JobStatusSchema,
  progressPercent: z.number().min(0).max(100),
  thumbnailUrl: z.string().url().nullish(),
  createdAt: z.string().datetime(),
  completedAt: z.string().datetime().nullish(),
})
export type SceneSummary = z.infer<typeof SceneSummarySchema>

// ── Scene detail (GET /scenes/:id) ───────────────────────────────────────────

export const SceneDetailSchema = z.object({
  sceneId: z.string().uuid(),
  displayName: z.string(),
  latestVersion: z.number().int().min(1),
  quality: QualityPresetSchema,
  filename: z.string(),
  fileSize: z.number(),
  latestJobId: z.string().uuid(),
  latestJobStatus: JobStatusSchema,
  qualityMetrics: QualityMetricsSchema,
  stats: SceneStatsSchema,
  artifacts: z.array(ArtifactSchema),
  outputFormats: z.array(OutputFormatSchema).min(1),
  simMp4ArtifactId: z.string().uuid().nullish(),
  createdAt: z.string().datetime(),
  completedAt: z.string().datetime().nullish(),
})
export type SceneDetail = z.infer<typeof SceneDetailSchema>

// ── Scene list response ──────────────────────────────────────────────────────

export const SceneListResponseSchema = z.object({
  scenes: z.array(SceneSummarySchema),
  total: z.number().int().min(0),
})
export type SceneListResponse = z.infer<typeof SceneListResponseSchema>

export const RerunSceneResponseSchema = z.object({
  jobId: z.string().uuid(),
})
export type RerunSceneResponse = z.infer<typeof RerunSceneResponseSchema>
