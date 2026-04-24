import { describe, it, expect } from "vitest"
import {
  JobStatusSchema,
  StageStatusSchema,
  StageNameSchema,
  QualityPresetSchema,
  OutputFormatSchema,
  STAGE_LABELS,
} from "../enums"

describe("JobStatusSchema", () => {
  it("accepts all valid statuses", () => {
    for (const s of ["queued", "running", "complete", "failed", "cancelled"]) {
      expect(JobStatusSchema.parse(s)).toBe(s)
    }
  })

  it("rejects invalid status", () => {
    expect(() => JobStatusSchema.parse("paused")).toThrow()
    expect(() => JobStatusSchema.parse("")).toThrow()
    expect(() => JobStatusSchema.parse(42)).toThrow()
  })
})

describe("StageStatusSchema", () => {
  it("accepts all valid statuses", () => {
    for (const s of ["pending", "running", "complete", "failed"]) {
      expect(StageStatusSchema.parse(s)).toBe(s)
    }
  })

  it("rejects invalid status", () => {
    expect(() => StageStatusSchema.parse("queued")).toThrow()
  })
})

describe("StageNameSchema", () => {
  const EXPECTED_STAGES = [
    "pose_estimation",
    "gaussian_training",
    "mesh_extraction",
    "mjcf_preparation",
    "artifact_export",
  ]

  it("accepts all pipeline stage names", () => {
    for (const s of EXPECTED_STAGES) {
      expect(StageNameSchema.parse(s)).toBe(s)
    }
  })

  it("rejects unknown stage names", () => {
    expect(() => StageNameSchema.parse("rendering")).toThrow()
  })

  it("every stage name has a display label", () => {
    for (const s of EXPECTED_STAGES) {
      expect(STAGE_LABELS[s as keyof typeof STAGE_LABELS]).toBeDefined()
      expect(typeof STAGE_LABELS[s as keyof typeof STAGE_LABELS]).toBe("string")
    }
  })
})

describe("QualityPresetSchema", () => {
  it("accepts fast, balanced, high", () => {
    for (const q of ["fast", "balanced", "high"]) {
      expect(QualityPresetSchema.parse(q)).toBe(q)
    }
  })

  it("rejects unknown presets", () => {
    expect(() => QualityPresetSchema.parse("ultra")).toThrow()
  })
})

describe("OutputFormatSchema", () => {
  it("accepts MJCF, GLB, PLY", () => {
    for (const f of ["MJCF", "GLB", "PLY"]) {
      expect(OutputFormatSchema.parse(f)).toBe(f)
    }
  })

  it("rejects lowercase variants", () => {
    expect(() => OutputFormatSchema.parse("glb")).toThrow()
  })
})
