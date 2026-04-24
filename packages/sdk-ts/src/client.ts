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
} from "@topolog/contracts"

export interface CreateJobInput extends CreateJobRequest {
  file?: Blob
}

export interface TopologClientConfig {
  baseUrl: string
  apiKey?: string
}

export class ApiError extends Error {
  readonly status: number
  readonly body: string

  constructor(method: string, path: string, status: number, body: string) {
    super(`API ${method} ${path} failed (${status}): ${body}`)
    this.name = "ApiError"
    this.status = status
    this.body = body
  }

  get isNotFound(): boolean {
    return this.status === 404
  }
}

interface SchemaParser<T> {
  parse(input: unknown): T
}

interface RequestOptions<TResponse> {
  json?: unknown
  body?: BodyInit
  bodySchema?: SchemaParser<unknown>
  responseSchema?: SchemaParser<TResponse>
  headers?: Record<string, string>
}

export class TopologClient {
  private baseUrl: string
  private apiKey?: string

  constructor(config: TopologClientConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, "")
    this.apiKey = config.apiKey
  }

  private async request<TResponse>(
    method: string,
    path: string,
    options: RequestOptions<TResponse> = {}
  ): Promise<TResponse> {
    const headers: Record<string, string> = { ...(options.headers ?? {}) }
    if (this.apiKey) {
      headers["Authorization"] = `Bearer ${this.apiKey}`
    }
    let payload = options.body
    if (payload === undefined && options.json !== undefined) {
      const jsonPayload = options.bodySchema ? options.bodySchema.parse(options.json) : options.json
      payload = JSON.stringify(jsonPayload)
      headers["Content-Type"] = "application/json"
    }

    const res = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers,
      body: payload,
    })

    if (!res.ok) {
      const text = await res.text().catch(() => "")
      throw new ApiError(method, path, res.status, text)
    }

    if (!options.responseSchema || res.status === 204) {
      return undefined as TResponse
    }

    const text = await res.text()
    if (!text) {
      throw new Error(`API ${method} ${path} returned an empty response body`)
    }

    let json: unknown
    try {
      json = JSON.parse(text)
    } catch (error) {
      throw new Error(
        `API ${method} ${path} returned invalid JSON: ${error instanceof Error ? error.message : String(error)}`
      )
    }

    return options.responseSchema.parse(json)
  }

  // ── Jobs ──────────────────────────────────────────────────────────────────

  async createJob(req: CreateJobInput): Promise<CreateJobResponse> {
    const { file, ...rawFields } = req
    const fields = CreateJobRequestSchema.parse(rawFields)

    if (file) {
      const form = new FormData()
      form.append("file", file, fields.filename)
      form.append("filename", fields.filename)
      form.append("fileSize", String(fields.fileSize))
      form.append("quality", fields.quality)
      for (const format of fields.outputFormats) {
        form.append("outputFormats", format)
      }
      return this.request<CreateJobResponse>("POST", "/jobs", {
        body: form,
        responseSchema: CreateJobResponseSchema,
      })
    }

    return this.request<CreateJobResponse>("POST", "/jobs", {
      json: fields,
      bodySchema: CreateJobRequestSchema,
      responseSchema: CreateJobResponseSchema,
    })
  }

  async getJob(id: string): Promise<JobResponse> {
    return this.request<JobResponse>("GET", `/jobs/${id}`, {
      responseSchema: JobResponseSchema,
    })
  }

  async cancelJob(id: string): Promise<void> {
    await this.request("POST", `/jobs/${id}/cancel`)
  }

  // ── Scenes ────────────────────────────────────────────────────────────────

  async listScenes(opts?: { offset?: number; limit?: number }): Promise<SceneListResponse> {
    const params = new URLSearchParams()
    if (opts?.offset != null) params.set("offset", String(opts.offset))
    if (opts?.limit != null) params.set("limit", String(opts.limit))
    const qs = params.toString()
    return this.request<SceneListResponse>("GET", `/scenes${qs ? `?${qs}` : ""}`, {
      responseSchema: SceneListResponseSchema,
    })
  }

  async getScene(id: string): Promise<SceneDetail> {
    return this.request<SceneDetail>("GET", `/scenes/${id}`, {
      responseSchema: SceneDetailSchema,
    })
  }

  async rerunScene(id: string): Promise<RerunSceneResponse> {
    return this.request<RerunSceneResponse>("POST", `/scenes/${id}/rerun`, {
      responseSchema: RerunSceneResponseSchema,
    })
  }

  async deleteScene(id: string): Promise<void> {
    await this.request("DELETE", `/scenes/${id}`)
  }
}
