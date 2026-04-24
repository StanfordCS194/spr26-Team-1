import {
  CreateJobRequestSchema,
  CreateJobResponseSchema,
  JobResponseSchema,
  SceneListResponseSchema,
  SceneDetailSchema,
  RerunSceneResponseSchema,
  type CreateJobRequest,
  type CreateJobResponse,
  type JobResponse,
  type SceneListResponse,
  type SceneDetail,
  type RerunSceneResponse,
  type Stage,
  type SceneSummary,
  type Artifact,
  type StageStatus,
  type StageName,
} from "@topolog/contracts"
import { ApiError, type CreateJobInput } from "./client"

// ── In-memory mock store ────────────────────────────────────────────────────

const DEFAULT_STAGES: { name: StageName; estimatedDurationMinutes: number }[] = [
  { name: "pose_estimation", estimatedDurationMinutes: 5 },
  { name: "gaussian_training", estimatedDurationMinutes: 18 },
  { name: "mesh_extraction", estimatedDurationMinutes: 5 },
  { name: "mjcf_preparation", estimatedDurationMinutes: 2 },
  { name: "artifact_export", estimatedDurationMinutes: 1 },
]

function createStages(status: StageStatus = "pending"): Stage[] {
  return DEFAULT_STAGES.map((s) => ({
    name: s.name,
    status,
    estimatedDurationMinutes: s.estimatedDurationMinutes,
  }))
}

function uuid(): string {
  return crypto.randomUUID()
}

function buildQueuedJob(
  req: CreateJobRequest,
  jobId: string,
  sceneId: string,
  createdAt: string
): JobResponse {
  return JobResponseSchema.parse({
    id: jobId,
    filename: req.filename,
    fileSize: req.fileSize,
    quality: req.quality,
    outputFormats: req.outputFormats,
    status: "queued",
    stages: createStages("pending"),
    currentStageIndex: 0,
    createdAt,
    sceneId,
  })
}

function buildSceneDetail(
  req: CreateJobRequest,
  jobId: string,
  sceneId: string,
  createdAt: string,
  latestVersion = 1
): SceneDetail {
  return SceneDetailSchema.parse({
    sceneId,
    displayName: req.filename.replace(/\.[^.]+$/, ""),
    latestVersion,
    quality: req.quality,
    filename: req.filename,
    fileSize: req.fileSize,
    latestJobId: jobId,
    latestJobStatus: "queued",
    qualityMetrics: {},
    stats: {},
    artifacts: [],
    outputFormats: req.outputFormats,
    createdAt,
  })
}

interface MockJob {
  response: JobResponse
  sceneId: string
}

const jobs = new Map<string, MockJob>()
const scenes = new Map<string, SceneDetail>()

// Seed with demo data
function seed() {
  const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString()
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

  const completeStages = createStages("complete").map((s) => ({
    ...s,
    startedAt: oneDayAgo,
    completedAt: twoHoursAgo,
  }))

  // Scene 1 — complete
  const scene1Id = uuid()
  const job1Id = uuid()
  jobs.set(job1Id, {
    sceneId: scene1Id,
    response: {
      id: job1Id,
      filename: "kitchen_scene.mp4",
      fileSize: 245_000_000,
      quality: "balanced",
      outputFormats: ["MJCF", "GLB", "PLY"],
      status: "complete",
      stages: completeStages,
      currentStageIndex: 4,
      createdAt: oneDayAgo,
      completedAt: twoHoursAgo,
      sceneId: scene1Id,
    },
  })

  const makeArtifact = (format: "MJCF" | "GLB" | "PLY", size: number): Artifact => ({
    id: uuid(),
    format,
    filename: `kitchen_scene.${format.toLowerCase()}`,
    sizeBytes: size,
    downloadUrl: `https://api.topolog.dev/artifacts/${uuid()}`,
    createdAt: twoHoursAgo,
  })

  scenes.set(scene1Id, {
    sceneId: scene1Id,
    displayName: "kitchen_scene",
    latestVersion: 1,
    quality: "balanced",
    filename: "kitchen_scene.mp4",
    fileSize: 245_000_000,
    latestJobId: job1Id,
    latestJobStatus: "complete",
    qualityMetrics: { splatPsnrDb: 28.4, meshQualityPercent: 80, mjcfValid: true },
    stats: {
      gaussianCount: 2_100_000,
      meshFaces: 185_359,
      collisionHulls: 16,
      reconstructionTimeSeconds: 1560,
      mjcfBodyCount: 2,
      mjcfGeomCount: 2,
      simulationStable: true,
    },
    artifacts: [
      makeArtifact("MJCF", 2_400_000),
      makeArtifact("GLB", 84_000_000),
      makeArtifact("PLY", 312_000_000),
    ],
    outputFormats: ["MJCF", "GLB", "PLY"],
    createdAt: oneDayAgo,
    completedAt: twoHoursAgo,
  })

  // Scene 2 — complete
  const scene2Id = uuid()
  const job2Id = uuid()
  jobs.set(job2Id, {
    sceneId: scene2Id,
    response: {
      id: job2Id,
      filename: "lab_room.mp4",
      fileSize: 312_000_000,
      quality: "high",
      outputFormats: ["MJCF", "GLB", "PLY"],
      status: "complete",
      stages: completeStages.map((s) => ({ ...s })),
      currentStageIndex: 4,
      createdAt: oneDayAgo,
      completedAt: twoHoursAgo,
      sceneId: scene2Id,
    },
  })
  scenes.set(scene2Id, {
    sceneId: scene2Id,
    displayName: "lab_room",
    latestVersion: 1,
    quality: "high",
    filename: "lab_room.mp4",
    fileSize: 312_000_000,
    latestJobId: job2Id,
    latestJobStatus: "complete",
    qualityMetrics: { splatPsnrDb: 30.1, meshQualityPercent: 85, mjcfValid: true },
    stats: {
      gaussianCount: 2_800_000,
      meshFaces: 163_722,
      collisionHulls: 22,
      reconstructionTimeSeconds: 2280,
      mjcfBodyCount: 3,
      mjcfGeomCount: 4,
      simulationStable: true,
    },
    artifacts: [
      makeArtifact("MJCF", 3_100_000),
      makeArtifact("GLB", 96_000_000),
      makeArtifact("PLY", 380_000_000),
    ],
    outputFormats: ["MJCF", "GLB", "PLY"],
    createdAt: oneDayAgo,
    completedAt: twoHoursAgo,
  })
}

seed()

export function resetMockState() {
  jobs.clear()
  scenes.clear()
  seed()
}

// ── Simulation helpers ──────────────────────────────────────────────────────

const STAGE_TICK_MS = 8000

const runningTimers = new Map<string, ReturnType<typeof setInterval>>()

function startJobSimulation(jobId: string) {
  const mock = jobs.get(jobId)
  if (!mock) return

  const job = mock.response
  job.status = "running"
  job.stages[0].status = "running"
  job.stages[0].startedAt = new Date().toISOString()
  job.currentStageIndex = 0

  const activeScene = scenes.get(mock.sceneId)
  if (activeScene) {
    activeScene.latestJobId = jobId
    activeScene.latestJobStatus = "running"
    activeScene.completedAt = undefined
  }

  const timer = setInterval(() => {
    const m = jobs.get(jobId)
    if (!m) {
      clearInterval(timer)
      runningTimers.delete(jobId)
      return
    }

    const j = m.response
    if (j.status !== "running") {
      clearInterval(timer)
      runningTimers.delete(jobId)
      return
    }

    const currentIdx = j.stages.findIndex((s) => s.status === "running")
    if (currentIdx === -1) {
      clearInterval(timer)
      runningTimers.delete(jobId)
      return
    }

    // Complete current stage
    j.stages[currentIdx].status = "complete"
    j.stages[currentIdx].completedAt = new Date().toISOString()

    // Start next or finish
    if (currentIdx + 1 < j.stages.length) {
      j.stages[currentIdx + 1].status = "running"
      j.stages[currentIdx + 1].startedAt = new Date().toISOString()
      j.currentStageIndex = currentIdx + 1
    } else {
      j.status = "complete"
      j.completedAt = new Date().toISOString()
      j.currentStageIndex = currentIdx

      // Update scene
      const scene = scenes.get(m.sceneId)
      if (scene) {
        scene.latestJobStatus = "complete"
        scene.completedAt = j.completedAt
        scene.qualityMetrics = { splatPsnrDb: 28.4, meshQualityPercent: 80, mjcfValid: true }
        scene.stats = {
          gaussianCount: 2_100_000,
          meshFaces: 185_359,
          collisionHulls: 16,
          reconstructionTimeSeconds: Math.round(
            (Date.now() - new Date(j.createdAt).getTime()) / 1000
          ),
          mjcfBodyCount: 2,
          mjcfGeomCount: 2,
          simulationStable: true,
        }
        scene.artifacts = j.outputFormats.map((fmt) => ({
          id: uuid(),
          format: fmt,
          filename: `${scene.displayName}.${fmt.toLowerCase()}`,
          sizeBytes: fmt === "PLY" ? 312_000_000 : fmt === "GLB" ? 84_000_000 : 2_400_000,
          downloadUrl: `https://api.topolog.dev/artifacts/${uuid()}`,
          createdAt: j.completedAt!,
        }))
      }
    }
  }, STAGE_TICK_MS)

  runningTimers.set(jobId, timer)
}

// ── Mock client ─────────────────────────────────────────────────────────────

export const mockClient = {
  async createJob(req: CreateJobInput): Promise<CreateJobResponse> {
    const parsedReq = CreateJobRequestSchema.parse(req)
    const jobId = uuid()
    const sceneId = uuid()
    const now = new Date().toISOString()

    const jobResponse = buildQueuedJob(parsedReq, jobId, sceneId, now)

    jobs.set(jobId, { response: jobResponse, sceneId })

    const sceneDetail = buildSceneDetail(parsedReq, jobId, sceneId, now)
    scenes.set(sceneId, sceneDetail)

    // Start simulation after a brief delay
    setTimeout(() => startJobSimulation(jobId), 500)

    return CreateJobResponseSchema.parse({ id: jobId, sceneId })
  },

  async getJob(id: string): Promise<JobResponse> {
    const mock = jobs.get(id)
    if (!mock) throw new ApiError("GET", `/jobs/${id}`, 404, "Job not found")
    return JobResponseSchema.parse(mock.response)
  },

  async cancelJob(id: string): Promise<void> {
    const mock = jobs.get(id)
    if (!mock) throw new ApiError("POST", `/jobs/${id}/cancel`, 404, "Job not found")
    mock.response.status = "cancelled"
  },

  async listScenes(opts?: { offset?: number; limit?: number }): Promise<SceneListResponse> {
    const all: SceneSummary[] = Array.from(scenes.values())
      .map((s) => ({
        sceneId: s.sceneId,
        displayName: s.displayName,
        latestVersion: s.latestVersion,
        latestJobId: s.latestJobId,
        latestJobStatus: s.latestJobStatus,
        progressPercent: computeProgress(s.latestJobId),
        thumbnailUrl: undefined,
        createdAt: s.createdAt,
        completedAt: s.completedAt,
      }))
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())

    const offset = opts?.offset ?? 0
    const limit = opts?.limit ?? 50
    const page = all.slice(offset, offset + limit)
    return SceneListResponseSchema.parse({ scenes: page, total: all.length })
  },

  async getScene(id: string): Promise<SceneDetail> {
    const scene = scenes.get(id)
    if (!scene) throw new ApiError("GET", `/scenes/${id}`, 404, "Scene not found")
    return SceneDetailSchema.parse(scene)
  },

  async rerunScene(id: string): Promise<RerunSceneResponse> {
    const scene = scenes.get(id)
    if (!scene) throw new ApiError("POST", `/scenes/${id}/rerun`, 404, "Scene not found")

    const req = CreateJobRequestSchema.parse({
      filename: scene.filename,
      fileSize: scene.fileSize,
      quality: scene.quality,
      outputFormats: scene.outputFormats,
    })

    const jobId = uuid()
    const now = new Date().toISOString()
    const jobResponse = buildQueuedJob(req, jobId, id, now)

    jobs.set(jobId, { response: jobResponse, sceneId: id })

    scene.latestVersion += 1
    scene.quality = req.quality
    scene.filename = req.filename
    scene.fileSize = req.fileSize
    scene.latestJobId = jobId
    scene.latestJobStatus = "queued"
    scene.qualityMetrics = {}
    scene.stats = {}
    scene.artifacts = []
    scene.outputFormats = req.outputFormats
    scene.completedAt = undefined

    setTimeout(() => startJobSimulation(jobId), 500)

    return RerunSceneResponseSchema.parse({ jobId })
  },

  async deleteScene(id: string): Promise<void> {
    const scene = scenes.get(id)
    if (scene) {
      // Clean up any associated jobs
      for (const [jobId, mock] of jobs.entries()) {
        if (mock.sceneId === id) {
          const timer = runningTimers.get(jobId)
          if (timer) {
            clearInterval(timer)
            runningTimers.delete(jobId)
          }
          jobs.delete(jobId)
        }
      }
      scenes.delete(id)
    }
  },
}

function computeProgress(jobId: string): number {
  const mock = jobs.get(jobId)
  if (!mock) return 0
  const completed = mock.response.stages.filter((s) => s.status === "complete").length
  return Math.round((completed / mock.response.stages.length) * 100)
}
