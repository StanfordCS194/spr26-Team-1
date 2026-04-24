"use client"

import { useMemo, useState } from "react"
import dynamic from "next/dynamic"
import { SceneViewer } from "./scene-viewer"

// Spark pulls in workers + WebGL that are client-only.
const SplatViewer = dynamic(
  () => import("./splat-viewer").then((m) => ({ default: m.SplatViewer })),
  {
    ssr: false,
    loading: () => (
      <div className="h-full min-h-[360px] w-full animate-pulse bg-[#080a0f]" />
    ),
  },
)

interface SceneViewerToggleProps {
  plyUrl?: string
  glbUrl?: string
  objUrl?: string
  simMp4Url?: string
  className?: string
}

type ViewMode = "radiance" | "mesh"

/**
 * SceneViewerToggle owns the result preview. Spark radiance remains the
 * primary surface; simulation mesh is available only as a secondary artifact.
 */
export function SceneViewerToggle({
  plyUrl,
  glbUrl,
  objUrl,
  simMp4Url,
  className = "",
}: SceneViewerToggleProps) {
  const hasSplat = Boolean(plyUrl)
  const hasMesh = Boolean(glbUrl || objUrl)
  const [mode, setMode] = useState<ViewMode>(hasSplat ? "radiance" : "mesh")

  const modes = useMemo(
    () => [
      {
        id: "radiance" as const,
        label: "Spark",
        detail: "Radiance field",
        disabled: !hasSplat,
      },
      {
        id: "mesh" as const,
        label: "Mesh",
        detail: "Simulation export",
        disabled: !hasMesh,
      },
    ],
    [hasMesh, hasSplat],
  )

  return (
    <div className={`space-y-3 ${className}`}>
      <div className="overflow-hidden rounded-lg border border-border bg-[#080a0f]">
        <div className="flex flex-col gap-3 border-b border-border/70 bg-background/80 px-3 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="truncate font-mono text-sm font-medium text-foreground">
              {mode === "radiance" ? "Spark radiance field" : "Simulation mesh"}
            </p>
            <p className="font-mono text-xs text-muted-foreground">
              {mode === "radiance" ? "PLY splat artifact" : "GLB mesh artifact"}
            </p>
          </div>
          <div className="inline-flex w-fit rounded-md border border-border bg-background p-0.5 font-mono text-xs">
            {modes.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setMode(item.id)}
                disabled={item.disabled}
                aria-pressed={mode === item.id}
                title={item.detail}
                className={`h-8 rounded px-3 transition-colors ${
                  mode === item.id
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:text-foreground"
                } ${item.disabled ? "cursor-not-allowed opacity-40" : ""}`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>

        <div className="relative aspect-[16/10] min-h-[360px]">
          <div
            style={{
              display: mode === "radiance" ? "block" : "none",
              height: "100%",
            }}
          >
            <SplatViewer plyUrl={plyUrl} className="h-full" />
          </div>
          <div
            style={{
              display: mode === "mesh" ? "block" : "none",
              height: "100%",
            }}
          >
            <SceneViewer glbUrl={glbUrl} objUrl={objUrl} className="h-full" />
          </div>
        </div>
      </div>

      {simMp4Url && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-foreground font-mono text-sm font-medium">
              MuJoCo stability proof (100 steps)
            </span>
          </div>
          <video
            src={simMp4Url}
            controls
            autoPlay
            muted
            loop
            playsInline
            className="w-full rounded-xl border border-border bg-black"
          />
        </div>
      )}
    </div>
  )
}
