"use client"

import { createContext, useContext } from "react"
import { mockClient } from "@topolog/sdk-ts"

import type {
  CreateJobResponse,
  JobResponse,
  SceneListResponse,
  SceneDetail,
  RerunSceneResponse,
} from "@topolog/contracts"
import type { CreateJobInput } from "@topolog/sdk-ts"

// ── API interface ───────────────────────────────────────────────────────────

export interface TopologAPI {
  createJob(req: CreateJobInput): Promise<CreateJobResponse>
  getJob(id: string): Promise<JobResponse>
  cancelJob(id: string): Promise<void>
  listScenes(opts?: { offset?: number; limit?: number }): Promise<SceneListResponse>
  getScene(id: string): Promise<SceneDetail>
  rerunScene(id: string): Promise<RerunSceneResponse>
  deleteScene(id: string): Promise<void>
}

export type AppMode = "demo" | "live"

export interface AppModeContextValue {
  mode: AppMode
  setMode: (mode: AppMode) => void
  liveAvailable: boolean
}

// ── Context ─────────────────────────────────────────────────────────────────

export const APIContext = createContext<TopologAPI>(mockClient)
export const AppModeContext = createContext<AppModeContextValue>({
  mode: "demo",
  setMode: () => {},
  liveAvailable: false,
})

export function useAPI(): TopologAPI {
  return useContext(APIContext)
}

export function useAppMode(): AppModeContextValue {
  return useContext(AppModeContext)
}
