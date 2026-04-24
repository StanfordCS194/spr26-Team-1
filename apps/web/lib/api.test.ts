import { describe, it, expect } from "vitest"
import { mockClient } from "@topolog/sdk-ts"
import { ApiError } from "@topolog/sdk-ts"

describe("API interface contract via mock client", () => {
  // ── Upload flow ────────────────────────────────────────────────────

  it("createJob returns id and sceneId", async () => {
    const result = await mockClient.createJob({
      filename: "test-room.mp4",
      fileSize: 50_000_000,
      quality: "balanced",
      outputFormats: ["MJCF", "GLB", "PLY"],
    })

    expect(result.id).toBeDefined()
    expect(result.sceneId).toBeDefined()
    expect(result.id.length).toBe(36)
    expect(result.sceneId.length).toBe(36)
  })

  // ── Job progress flow ──────────────────────────────────────────────

  it("getJob returns job with stages array", async () => {
    const { id } = await mockClient.createJob({
      filename: "progress-test.mp4",
      fileSize: 1_000_000,
      quality: "fast",
      outputFormats: ["PLY"],
    })

    const job = await mockClient.getJob(id)
    expect(job.id).toBe(id)
    expect(job.stages).toBeInstanceOf(Array)
    expect(job.stages.length).toBeGreaterThanOrEqual(1)
    expect(job.stages[0]).toHaveProperty("name")
    expect(job.stages[0]).toHaveProperty("status")
    expect(job.stages[0]).toHaveProperty("estimatedDurationMinutes")
  })

  it("cancelJob marks job as cancelled", async () => {
    const { id } = await mockClient.createJob({
      filename: "cancel-test.mp4",
      fileSize: 1_000_000,
      quality: "fast",
      outputFormats: ["PLY"],
    })

    await mockClient.cancelJob(id)
    const job = await mockClient.getJob(id)
    expect(job.status).toBe("cancelled")
  })

  // ── Library flow ───────────────────────────────────────────────────

  it("listScenes returns scenes array and total count", async () => {
    const result = await mockClient.listScenes()
    expect(result).toHaveProperty("scenes")
    expect(result).toHaveProperty("total")
    expect(result.scenes).toBeInstanceOf(Array)
    expect(typeof result.total).toBe("number")
  })

  it("listScenes respects offset/limit pagination", async () => {
    const full = await mockClient.listScenes()
    if (full.total <= 1) return

    const page = await mockClient.listScenes({ offset: 0, limit: 1 })
    expect(page.scenes.length).toBeLessThanOrEqual(1)
    expect(page.total).toBe(full.total)
  })

  it("scene summaries have required display fields", async () => {
    const result = await mockClient.listScenes()
    if (result.scenes.length === 0) return

    const scene = result.scenes[0]
    expect(scene).toHaveProperty("sceneId")
    expect(scene).toHaveProperty("displayName")
    expect(scene).toHaveProperty("latestJobStatus")
    expect(scene).toHaveProperty("progressPercent")
    expect(scene).toHaveProperty("createdAt")
  })

  // ── Scene detail flow ──────────────────────────────────────────────

  it("getScene returns detail with quality metrics and artifacts", async () => {
    const scenes = await mockClient.listScenes()
    const completedScene = scenes.scenes.find((s) => s.latestJobStatus === "complete")
    if (!completedScene) return

    const detail = await mockClient.getScene(completedScene.sceneId)
    expect(detail.sceneId).toBe(completedScene.sceneId)
    expect(detail).toHaveProperty("qualityMetrics")
    expect(detail).toHaveProperty("stats")
    expect(detail).toHaveProperty("artifacts")
    expect(detail.artifacts).toBeInstanceOf(Array)
  })

  it("getScene throws ApiError(404) for non-existent scene", async () => {
    try {
      await mockClient.getScene("non-existent-scene-id")
      expect.fail("should have thrown")
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError)
      expect((err as ApiError).isNotFound).toBe(true)
      expect((err as ApiError).status).toBe(404)
    }
  })

  // ── Rerun flow ─────────────────────────────────────────────────────

  it("rerunScene returns a new jobId", async () => {
    const { sceneId, id: originalJobId } = await mockClient.createJob({
      filename: "rerun-test.mp4",
      fileSize: 5_000_000,
      quality: "balanced",
      outputFormats: ["PLY"],
    })

    const result = await mockClient.rerunScene(sceneId)
    expect(result.jobId).toBeDefined()
    expect(result.jobId).not.toBe(originalJobId)
  })

  // ── Delete flow ────────────────────────────────────────────────────

  it("deleteScene removes scene from listing", async () => {
    const { sceneId } = await mockClient.createJob({
      filename: "delete-test.mp4",
      fileSize: 5_000_000,
      quality: "fast",
      outputFormats: ["PLY"],
    })

    await mockClient.deleteScene(sceneId)

    try {
      await mockClient.getScene(sceneId)
      expect.fail("should have thrown after delete")
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError)
      expect((err as ApiError).isNotFound).toBe(true)
    }
  })
})
