import { describe, it, expect } from "vitest"
import {
  StageSchema,
  CreateJobRequestSchema,
  JobResponseSchema,
  CreateJobResponseSchema,
} from "../jobs"

// ── Fixtures ────────────────────────────────────────────────────────────────

const VALID_STAGE = {
  name: "pose_estimation",
  status: "pending",
  estimatedDurationMinutes: 5,
}

const VALID_STAGE_COMPLETE = {
  name: "gaussian_training",
  status: "complete",
  startedAt: "2025-01-01T00:00:00.000Z",
  completedAt: "2025-01-01T00:18:00.000Z",
  estimatedDurationMinutes: 18,
}

const VALID_CREATE_JOB = {
  filename: "kitchen.mp4",
  fileSize: 245000000,
  quality: "balanced",
  outputFormats: ["MJCF", "GLB", "PLY"],
}

const VALID_JOB_RESPONSE = {
  id: "550e8400-e29b-41d4-a716-446655440000",
  filename: "kitchen.mp4",
  fileSize: 245000000,
  quality: "balanced",
  outputFormats: ["MJCF", "GLB", "PLY"],
  status: "running",
  stages: [
    { name: "pose_estimation", status: "complete", startedAt: "2025-01-01T00:00:00.000Z", completedAt: "2025-01-01T00:05:00.000Z", estimatedDurationMinutes: 5 },
    { name: "gaussian_training", status: "running", startedAt: "2025-01-01T00:05:00.000Z", estimatedDurationMinutes: 18 },
    { name: "mesh_extraction", status: "pending", estimatedDurationMinutes: 5 },
    { name: "mjcf_preparation", status: "pending", estimatedDurationMinutes: 2 },
    { name: "artifact_export", status: "pending", estimatedDurationMinutes: 1 },
  ],
  currentStageIndex: 1,
  createdAt: "2025-01-01T00:00:00.000Z",
  sceneId: "660e8400-e29b-41d4-a716-446655440001",
}

// ── Stage tests ─────────────────────────────────────────────────────────────

describe("StageSchema", () => {
  it("parses a pending stage", () => {
    const result = StageSchema.parse(VALID_STAGE)
    expect(result.name).toBe("pose_estimation")
    expect(result.status).toBe("pending")
    expect(result.startedAt).toBeUndefined()
  })

  it("parses a complete stage with timestamps", () => {
    const result = StageSchema.parse(VALID_STAGE_COMPLETE)
    expect(result.status).toBe("complete")
    expect(result.startedAt).toBeDefined()
    expect(result.completedAt).toBeDefined()
  })

  it("rejects stage with unknown name", () => {
    expect(() => StageSchema.parse({ ...VALID_STAGE, name: "unknown" })).toThrow()
  })

  it("rejects stage missing estimatedDurationMinutes", () => {
    const { estimatedDurationMinutes, ...missing } = VALID_STAGE
    expect(() => StageSchema.parse(missing)).toThrow()
  })
})

// ── CreateJobRequest tests ──────────────────────────────────────────────────

describe("CreateJobRequestSchema", () => {
  it("parses valid create job request", () => {
    const result = CreateJobRequestSchema.parse(VALID_CREATE_JOB)
    expect(result.filename).toBe("kitchen.mp4")
    expect(result.outputFormats).toHaveLength(3)
  })

  it("rejects empty filename", () => {
    expect(() =>
      CreateJobRequestSchema.parse({ ...VALID_CREATE_JOB, filename: "" })
    ).toThrow()
  })

  it("rejects negative fileSize", () => {
    expect(() =>
      CreateJobRequestSchema.parse({ ...VALID_CREATE_JOB, fileSize: -1 })
    ).toThrow()
  })

  it("rejects zero fileSize", () => {
    expect(() =>
      CreateJobRequestSchema.parse({ ...VALID_CREATE_JOB, fileSize: 0 })
    ).toThrow()
  })

  it("rejects empty outputFormats", () => {
    expect(() =>
      CreateJobRequestSchema.parse({ ...VALID_CREATE_JOB, outputFormats: [] })
    ).toThrow()
  })

  it("rejects invalid quality preset", () => {
    expect(() =>
      CreateJobRequestSchema.parse({ ...VALID_CREATE_JOB, quality: "ultra" })
    ).toThrow()
  })

  it("rejects invalid output format", () => {
    expect(() =>
      CreateJobRequestSchema.parse({ ...VALID_CREATE_JOB, outputFormats: ["OBJ"] })
    ).toThrow()
  })
})

// ── JobResponse tests ───────────────────────────────────────────────────────

describe("JobResponseSchema", () => {
  it("parses a valid running job response", () => {
    const result = JobResponseSchema.parse(VALID_JOB_RESPONSE)
    expect(result.id).toBe("550e8400-e29b-41d4-a716-446655440000")
    expect(result.status).toBe("running")
    expect(result.stages).toHaveLength(5)
    expect(result.completedAt).toBeUndefined()
    expect(result.sceneId).toBe("660e8400-e29b-41d4-a716-446655440001")
  })

  it("parses a complete job response with completedAt", () => {
    const complete = {
      ...VALID_JOB_RESPONSE,
      status: "complete",
      completedAt: "2025-01-01T00:31:00.000Z",
    }
    const result = JobResponseSchema.parse(complete)
    expect(result.completedAt).toBe("2025-01-01T00:31:00.000Z")
  })

  it("rejects non-UUID id", () => {
    expect(() =>
      JobResponseSchema.parse({ ...VALID_JOB_RESPONSE, id: "not-a-uuid" })
    ).toThrow()
  })

  it("rejects negative currentStageIndex", () => {
    expect(() =>
      JobResponseSchema.parse({ ...VALID_JOB_RESPONSE, currentStageIndex: -1 })
    ).toThrow()
  })
})

// ── CreateJobResponse tests ─────────────────────────────────────────────────

describe("CreateJobResponseSchema", () => {
  it("parses valid create response", () => {
    const result = CreateJobResponseSchema.parse({
      id: "550e8400-e29b-41d4-a716-446655440000",
      sceneId: "660e8400-e29b-41d4-a716-446655440001",
    })
    expect(result.id).toBeDefined()
    expect(result.sceneId).toBeDefined()
  })

  it("rejects non-UUID fields", () => {
    expect(() =>
      CreateJobResponseSchema.parse({ id: "abc", sceneId: "def" })
    ).toThrow()
  })
})
