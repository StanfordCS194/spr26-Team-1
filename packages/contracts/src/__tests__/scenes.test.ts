import { describe, it, expect } from "vitest"
import {
  ArtifactSchema,
  QualityMetricsSchema,
  SceneStatsSchema,
  SceneSummarySchema,
  SceneDetailSchema,
  SceneListResponseSchema,
} from "../scenes"
import { JobResponseSchema } from "../jobs"

// ── Fixtures ────────────────────────────────────────────────────────────────

const VALID_ARTIFACT = {
  id: "a50e8400-e29b-41d4-a716-446655440000",
  format: "PLY",
  filename: "scene.ply",
  sizeBytes: 312000000,
  downloadUrl: "https://api.topolog.dev/artifacts/a50e8400",
  createdAt: "2025-01-01T00:31:00.000Z",
}

const VALID_QUALITY_METRICS = {
  splatPsnrDb: 28.4,
  meshQualityPercent: 80,
  mjcfValid: true,
}

const VALID_SCENE_STATS = {
  gaussianCount: 2100000,
  meshFaces: 84000,
  collisionHulls: 16,
  reconstructionTimeSeconds: 1560,
}

const VALID_SCENE_SUMMARY = {
  sceneId: "660e8400-e29b-41d4-a716-446655440001",
  displayName: "kitchen_scene",
  latestVersion: 1,
  latestJobId: "550e8400-e29b-41d4-a716-446655440000",
  latestJobStatus: "complete",
  progressPercent: 100,
  createdAt: "2025-01-01T00:00:00.000Z",
  completedAt: "2025-01-01T00:31:00.000Z",
}

const VALID_SCENE_DETAIL = {
  sceneId: "660e8400-e29b-41d4-a716-446655440001",
  displayName: "kitchen_scene",
  latestVersion: 1,
  quality: "balanced",
  filename: "kitchen.mp4",
  fileSize: 245000000,
  latestJobId: "550e8400-e29b-41d4-a716-446655440000",
  latestJobStatus: "complete",
  qualityMetrics: VALID_QUALITY_METRICS,
  stats: VALID_SCENE_STATS,
  artifacts: [VALID_ARTIFACT],
  outputFormats: ["MJCF", "GLB", "PLY"],
  createdAt: "2025-01-01T00:00:00.000Z",
  completedAt: "2025-01-01T00:31:00.000Z",
}

// ── Artifact tests ──────────────────────────────────────────────────────────

describe("ArtifactSchema", () => {
  it("parses a valid artifact", () => {
    const result = ArtifactSchema.parse(VALID_ARTIFACT)
    expect(result.format).toBe("PLY")
    expect(result.sizeBytes).toBe(312000000)
  })

  it("rejects artifact with 0 size", () => {
    expect(() =>
      ArtifactSchema.parse({ ...VALID_ARTIFACT, sizeBytes: 0 })
    ).toThrow()
  })

  it("rejects artifact with invalid URL", () => {
    expect(() =>
      ArtifactSchema.parse({ ...VALID_ARTIFACT, downloadUrl: "not-a-url" })
    ).toThrow()
  })

  it("rejects artifact with invalid format", () => {
    expect(() =>
      ArtifactSchema.parse({ ...VALID_ARTIFACT, format: "OBJ" })
    ).toThrow()
  })
})

// ── Quality metrics tests ───────────────────────────────────────────────────

describe("QualityMetricsSchema", () => {
  it("parses full metrics", () => {
    const result = QualityMetricsSchema.parse(VALID_QUALITY_METRICS)
    expect(result.splatPsnrDb).toBe(28.4)
    expect(result.mjcfValid).toBe(true)
  })

  it("parses empty metrics (all optional)", () => {
    const result = QualityMetricsSchema.parse({})
    expect(result.splatPsnrDb).toBeUndefined()
    expect(result.meshQualityPercent).toBeUndefined()
    expect(result.mjcfValid).toBeUndefined()
  })

  it("rejects meshQualityPercent > 100", () => {
    expect(() =>
      QualityMetricsSchema.parse({ meshQualityPercent: 101 })
    ).toThrow()
  })

  it("rejects meshQualityPercent < 0", () => {
    expect(() =>
      QualityMetricsSchema.parse({ meshQualityPercent: -1 })
    ).toThrow()
  })
})

// ── Scene stats tests ───────────────────────────────────────────────────────

describe("SceneStatsSchema", () => {
  it("parses full stats", () => {
    const result = SceneStatsSchema.parse(VALID_SCENE_STATS)
    expect(result.gaussianCount).toBe(2100000)
  })

  it("parses empty stats (all optional)", () => {
    const result = SceneStatsSchema.parse({})
    expect(result.gaussianCount).toBeUndefined()
  })
})

// ── Scene summary tests ─────────────────────────────────────────────────────

describe("SceneSummarySchema", () => {
  it("parses a valid summary", () => {
    const result = SceneSummarySchema.parse(VALID_SCENE_SUMMARY)
    expect(result.displayName).toBe("kitchen_scene")
    expect(result.progressPercent).toBe(100)
  })

  it("parses summary without optional fields", () => {
    const { completedAt, thumbnailUrl, ...minimal } = VALID_SCENE_SUMMARY as any
    const result = SceneSummarySchema.parse(minimal)
    expect(result.completedAt).toBeUndefined()
  })

  it("rejects progressPercent > 100", () => {
    expect(() =>
      SceneSummarySchema.parse({ ...VALID_SCENE_SUMMARY, progressPercent: 101 })
    ).toThrow()
  })

  it("rejects non-UUID sceneId", () => {
    expect(() =>
      SceneSummarySchema.parse({ ...VALID_SCENE_SUMMARY, sceneId: "bad" })
    ).toThrow()
  })
})

// ── Scene detail tests ──────────────────────────────────────────────────────

describe("SceneDetailSchema", () => {
  it("parses a full scene detail", () => {
    const result = SceneDetailSchema.parse(VALID_SCENE_DETAIL)
    expect(result.sceneId).toBeDefined()
    expect(result.artifacts).toHaveLength(1)
    expect(result.stats.gaussianCount).toBe(2100000)
    expect(result.qualityMetrics.mjcfValid).toBe(true)
  })

  it("parses scene detail with empty artifacts", () => {
    const result = SceneDetailSchema.parse({ ...VALID_SCENE_DETAIL, artifacts: [] })
    expect(result.artifacts).toHaveLength(0)
  })
})

// ── Scene list response tests ───────────────────────────────────────────────

describe("SceneListResponseSchema", () => {
  it("parses valid list", () => {
    const result = SceneListResponseSchema.parse({
      scenes: [VALID_SCENE_SUMMARY],
      total: 1,
    })
    expect(result.scenes).toHaveLength(1)
    expect(result.total).toBe(1)
  })

  it("parses empty list", () => {
    const result = SceneListResponseSchema.parse({ scenes: [], total: 0 })
    expect(result.scenes).toHaveLength(0)
  })
})

// ── Snapshot tests for backward compatibility ───────────────────────────────

describe("Schema shape snapshots", () => {
  it("JobResponse shape snapshot", () => {
    const parsed = JobResponseSchema.parse({
      ...VALID_SCENE_DETAIL,
      id: "550e8400-e29b-41d4-a716-446655440000",
      filename: "kitchen.mp4",
      fileSize: 245000000,
      quality: "balanced",
      outputFormats: ["MJCF", "GLB", "PLY"],
      status: "complete",
      stages: [
        { name: "pose_estimation", status: "complete", estimatedDurationMinutes: 5 },
      ],
      currentStageIndex: 0,
      createdAt: "2025-01-01T00:00:00.000Z",
    })
    expect(Object.keys(parsed).sort()).toMatchSnapshot()
  })

  it("SceneDetail shape snapshot", () => {
    const parsed = SceneDetailSchema.parse(VALID_SCENE_DETAIL)
    expect(Object.keys(parsed).sort()).toMatchSnapshot()
  })

  it("Artifact shape snapshot", () => {
    const parsed = ArtifactSchema.parse(VALID_ARTIFACT)
    expect(Object.keys(parsed).sort()).toMatchSnapshot()
  })
})
