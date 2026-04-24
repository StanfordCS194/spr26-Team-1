"use client"

import { useState, useCallback, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Check, Download, RefreshCw, Trash2, Loader2 } from "lucide-react"
import dynamic from "next/dynamic"

const SceneViewerToggle = dynamic(
  () =>
    import("@/components/scene-viewer-toggle").then((m) => ({
      default: m.SceneViewerToggle,
    })),
  {
    ssr: false,
    loading: () => (
      <div className="aspect-[16/10] min-h-[360px] animate-pulse rounded-lg border border-border bg-[#080a0f]" />
    ),
  },
)
import { useAPI } from "@/lib/api"
import { ApiError } from "@topolog/sdk-ts"
import type { SceneDetail } from "@topolog/contracts"
import { formatFileSize, formatDate, formatReconTime, psnrLabel, meshQualityLabel } from "@/lib/utils"
import { toast } from "sonner"

export default function SceneResultPage({ params }: { params: { id: string } }) {
  const { id } = params
  const router = useRouter()
  const api = useAPI()
  const [scene, setScene] = useState<SceneDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)

  useEffect(() => {
    let cancelled = false
    let pollTimeout: ReturnType<typeof setTimeout> | undefined
    let pollCount = 0
    const MAX_POLLS = 600

    const load = async () => {
      try {
        const data = await api.getScene(id)
        if (!cancelled) {
          setScene(data)
          const isTerminal = data.latestJobStatus === "complete" || data.latestJobStatus === "failed" || data.latestJobStatus === "cancelled"
          if (!isTerminal && pollCount < MAX_POLLS) {
            pollCount++
            const delay = Math.min(3000 * Math.pow(1.1, Math.floor(pollCount / 20)), 15000)
            pollTimeout = setTimeout(load, delay)
          }
        }
      } catch (err) {
        console.error("[topolog] Failed to load scene:", err)
        if (!cancelled) {
          if (err instanceof ApiError && err.isNotFound) {
            setLoadError("not_found")
          } else {
            setLoadError(String(err))
            toast.error("Failed to load scene details")
          }
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true; if (pollTimeout) clearTimeout(pollTimeout) }
  }, [id, api])

  const handleRerun = useCallback(async () => {
    try {
      const result = await api.rerunScene(id)
      router.push(`/jobs/${result.jobId}`)
    } catch (err) {
      console.error("[topolog] Failed to rerun scene:", err)
      toast.error("Failed to start re-run. Please try again.")
    }
  }, [id, api, router])

  const handleDelete = useCallback(async () => {
    try {
      await api.deleteScene(id)
      toast.success("Scene deleted")
      router.push("/library")
    } catch (err) {
      console.error("[topolog] Failed to delete scene:", err)
      toast.error("Failed to delete scene")
    }
  }, [id, api, router])

  const handleDownload = useCallback((url: string, format: string) => {
    const a = document.createElement("a")
    a.href = url
    a.download = ""
    a.rel = "noopener"
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    toast.success(`Download started: ${format}`)
  }, [])

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-6 w-6 text-primary animate-spin" />
      </div>
    )
  }

  if (!scene) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-2">
        <p className="text-muted-foreground font-mono">
          {loadError === "not_found" ? "Scene not found" : "Failed to load scene"}
        </p>
        {loadError && loadError !== "not_found" && (
          <p className="text-muted-foreground font-mono text-xs max-w-md text-center">{loadError}</p>
        )}
        <Button
          variant="outline"
          size="sm"
          onClick={() => router.push("/library")}
          className="mt-2 font-mono text-muted-foreground border-border hover:text-foreground"
        >
          Go to library
        </Button>
      </div>
    )
  }

  

  const isProcessing = scene.latestJobStatus === "queued" || scene.latestJobStatus === "running"
  const isFailed = scene.latestJobStatus === "failed"

  return (
    <div className="min-h-screen bg-background">
      <main className="max-w-7xl mx-auto p-6">
        {isProcessing && (
          <div className="mb-4 rounded-xl border border-primary/30 bg-primary/5 px-4 py-3 flex items-center gap-3">
            <Loader2 className="h-4 w-4 text-primary animate-spin shrink-0" />
            <p className="font-mono text-sm text-primary">
              Reconstruction in progress. Results will appear here when complete.
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => router.push(`/jobs/${scene.latestJobId}`)}
              className="ml-auto shrink-0 font-mono text-xs"
            >
              View progress
            </Button>
          </div>
        )}
        {isFailed && (
          <div className="mb-4 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 flex items-center gap-3">
            <p className="font-mono text-sm text-destructive">
              The last reconstruction run failed. You can re-run or check the previous results below.
            </p>
          </div>
        )}
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-foreground font-mono text-lg font-medium">{scene.displayName}</h1>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleRerun}
              className="gap-2 text-muted-foreground border-border hover:text-foreground"
            >
              <RefreshCw className="h-4 w-4" />
              Re-run
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowDeleteDialog(true)}
              className="gap-2 text-muted-foreground border-border hover:text-destructive hover:border-destructive"
            >
              <Trash2 className="h-4 w-4" />
              Delete
            </Button>
          </div>
        </div>

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
          {/* Left Column - Spark preview + optional stability MP4 */}
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <span className="text-foreground font-mono text-sm font-medium">
                Radiance preview
              </span>
            </div>

            {(() => {
              const plyUrl = scene.artifacts.find((a) => a.format === "PLY")?.downloadUrl
              const glbUrl = scene.artifacts.find((a) => a.format === "GLB")?.downloadUrl
              const mp4Url = scene.artifacts.find(
                (a) => (a.format as string) === "MP4",
              )?.downloadUrl
              return (
                <SceneViewerToggle
                  plyUrl={plyUrl}
                  glbUrl={glbUrl}
                  simMp4Url={mp4Url}
                />
              )
            })()}
          </div>

          {/* Right Column - Metadata and Downloads */}
          <div className="space-y-6">
          {/* Quality Scores */}
          <section className="rounded-xl border border-border bg-card p-4 space-y-4">
            <h3 className="text-foreground font-mono font-medium text-sm uppercase tracking-wider">
              Quality Scores
            </h3>
            
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground font-mono text-sm">Splat PSNR</span>
                <div className="flex items-center gap-2">
                  <span className="text-foreground font-mono text-sm font-medium">
                    {scene.qualityMetrics.splatPsnrDb ? `${scene.qualityMetrics.splatPsnrDb} dB` : "—"}
                  </span>
                  {scene.qualityMetrics.splatPsnrDb && (
                    <span className="text-xs font-mono px-2 py-0.5 rounded bg-primary/10 text-primary">
                      {psnrLabel(scene.qualityMetrics.splatPsnrDb)}
                    </span>
                  )}
                </div>
              </div>
              
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground font-mono text-sm">Mesh quality</span>
                  {scene.qualityMetrics.meshQualityPercent !== undefined && (
                    <span className="text-xs font-mono px-2 py-0.5 rounded bg-primary/10 text-primary">
                      {meshQualityLabel(scene.qualityMetrics.meshQualityPercent)}
                    </span>
                  )}
                </div>
                <Progress value={scene.qualityMetrics.meshQualityPercent ?? 0} className="h-1.5" />
              </div>
              
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground font-mono text-sm">MJCF</span>
                <div className="flex items-center gap-2">
                  {scene.qualityMetrics.mjcfValid ? (
                    <>
                      <Check className="h-4 w-4 text-primary" />
                      <span className="text-xs font-mono px-2 py-0.5 rounded bg-primary/10 text-primary">valid</span>
                    </>
                  ) : scene.qualityMetrics.mjcfValid === false ? (
                    <span className="text-xs font-mono px-2 py-0.5 rounded bg-destructive/10 text-destructive">invalid</span>
                  ) : (
                    <span className="text-xs font-mono px-2 py-0.5 rounded bg-muted text-muted-foreground">pending</span>
                  )}
                </div>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-muted-foreground font-mono text-sm">Simulation step</span>
                <div className="flex items-center gap-2">
                  {scene.stats.simulationStable === true ? (
                    <>
                      <Check className="h-4 w-4 text-primary" />
                      <span className="text-xs font-mono px-2 py-0.5 rounded bg-primary/10 text-primary">stable</span>
                    </>
                  ) : scene.stats.simulationStable === false ? (
                    <span className="text-xs font-mono px-2 py-0.5 rounded bg-destructive/10 text-destructive">unstable</span>
                  ) : (
                    <span className="text-xs font-mono px-2 py-0.5 rounded bg-muted text-muted-foreground">pending</span>
                  )}
                </div>
              </div>
            </div>
          </section>

          {/* Scene Stats */}
          <section className="rounded-xl border border-border bg-card p-4 space-y-3">
            <h3 className="text-foreground font-mono font-medium text-sm uppercase tracking-wider">
              Scene Stats
            </h3>
            
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-muted-foreground font-mono text-xs">Gaussians</p>
                <p className="text-foreground font-mono text-sm font-medium">
                  {scene.stats.gaussianCount?.toLocaleString() ?? "—"}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground font-mono text-xs">Mesh faces</p>
                <p className="text-foreground font-mono text-sm font-medium">
                  {scene.stats.meshFaces?.toLocaleString() ?? "—"}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground font-mono text-xs">Collision hulls</p>
                <p className="text-foreground font-mono text-sm font-medium">
                  {scene.stats.collisionHulls?.toLocaleString() ?? "—"}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground font-mono text-xs">Reconstruction time</p>
                <p className="text-foreground font-mono text-sm font-medium">
                  {formatReconTime(scene.stats.reconstructionTimeSeconds)}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground font-mono text-xs">MJCF bodies</p>
                <p className="text-foreground font-mono text-sm font-medium">
                  {scene.stats.mjcfBodyCount?.toLocaleString() ?? "—"}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground font-mono text-xs">MJCF geoms</p>
                <p className="text-foreground font-mono text-sm font-medium">
                  {scene.stats.mjcfGeomCount?.toLocaleString() ?? "—"}
                </p>
              </div>
            </div>
          </section>

          {/* Downloads */}
          <section className="rounded-xl border border-border bg-card p-4 space-y-3">
            <h3 className="text-foreground font-mono font-medium text-sm uppercase tracking-wider">
              Downloads
            </h3>
            
            <div className="space-y-2">
              {scene.artifacts.map((artifact) => (
                <button
                  key={artifact.id}
                  onClick={() => handleDownload(artifact.downloadUrl, artifact.format)}
                  className="w-full flex items-center justify-between p-3 rounded-lg border border-border bg-background hover:border-primary hover:bg-primary/5 transition-colors group"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-foreground font-mono font-medium">{artifact.format}</span>
                    <span className="text-muted-foreground font-mono text-sm">{formatFileSize(artifact.sizeBytes)}</span>
                  </div>
                  <Download className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
                </button>
              ))}
            </div>
          </section>

          {/* Metadata */}
          <section className="rounded-xl border border-border bg-card p-4 space-y-3">
            <h3 className="text-foreground font-mono font-medium text-sm uppercase tracking-wider">
              Metadata
            </h3>
            
            <div className="space-y-2">
              <div className="flex items-start justify-between">
                <span className="text-muted-foreground font-mono text-xs">Scene ID</span>
                <span className="text-foreground font-mono text-xs text-right break-all max-w-[60%]">{scene.sceneId}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground font-mono text-xs">Created</span>
                <span className="text-foreground font-mono text-xs">{formatDate(scene.createdAt)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground font-mono text-xs">Quality</span>
                <span className="text-foreground font-mono text-xs capitalize">{scene.quality}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground font-mono text-xs">Input file</span>
                <span className="text-foreground font-mono text-xs">{scene.filename}</span>
              </div>
            </div>
          </section>
        </div>
        </div>

        <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
          <AlertDialogContent className="bg-card border-border">
            <AlertDialogHeader>
              <AlertDialogTitle className="font-mono text-foreground">Delete scene</AlertDialogTitle>
              <AlertDialogDescription className="font-mono text-muted-foreground">
                This will permanently delete &ldquo;{scene.displayName}&rdquo; and all its artifacts. This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel className="font-mono border-border text-muted-foreground hover:text-foreground">
                Cancel
              </AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDelete}
                className="font-mono bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </main>
    </div>
  )
}
