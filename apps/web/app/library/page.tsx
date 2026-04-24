"use client"

import { useState, useMemo, useEffect } from "react"
import Image from "next/image"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Plus, Search, Loader2, RefreshCw, Check } from "lucide-react"
import { useAPI } from "@/lib/api"
import { formatTimeAgo } from "@/lib/utils"
import type { SceneSummary } from "@topolog/contracts"
import { toast } from "sonner"

export default function LibraryPage() {
  const router = useRouter()
  const api = useAPI()
  const [scenes, setScenes] = useState<SceneSummary[]>([])
  const [totalCount, setTotalCount] = useState(0)
  const [searchQuery, setSearchQuery] = useState("")
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const PAGE_SIZE = 24

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const data = await api.listScenes({ offset: 0, limit: PAGE_SIZE })
        if (!cancelled) {
          setScenes(data.scenes)
          setTotalCount(data.total)
        }
      } catch (err) {
        console.error("[topolog] Failed to load scenes:", err)
        if (!cancelled) toast.error("Failed to load scenes")
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [api])

  const loadMore = async () => {
    setLoadingMore(true)
    try {
      const data = await api.listScenes({ offset: scenes.length, limit: PAGE_SIZE })
      setScenes((prev) => [...prev, ...data.scenes])
      setTotalCount(data.total)
    } catch (err) {
      toast.error("Failed to load more scenes")
    } finally {
      setLoadingMore(false)
    }
  }

  const hasMore = scenes.length < totalCount

  const visibleScenes = useMemo(() => {
    return scenes
      .filter((s) => s.latestJobStatus !== "cancelled")
      .filter((s) => {
        if (!searchQuery) return true
        return s.displayName.toLowerCase().includes(searchQuery.toLowerCase())
      })
  }, [scenes, searchQuery])

  return (
    <div className="min-h-screen bg-background">
      <main className="max-w-7xl mx-auto px-6 py-8">
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex-1 max-w-md">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                type="text"
                placeholder="Search scenes..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 bg-card border-border text-foreground placeholder:text-muted-foreground font-mono"
              />
            </div>
          </div>
          <Button
            onClick={() => router.push("/")}
            className="bg-primary text-primary-foreground hover:bg-primary/90 font-mono gap-2 shrink-0"
          >
            <Plus className="h-4 w-4" />
            New scene
          </Button>
        </div>
        {/* Count label */}
        <div className="mb-6">
          <span className="text-muted-foreground font-mono text-sm">
            Scenes ({totalCount})
          </span>
        </div>

        {loading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="h-6 w-6 text-primary animate-spin" />
          </div>
        ) : visibleScenes.length === 0 && !searchQuery ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-muted">
              <Plus className="h-8 w-8 text-muted-foreground" />
            </div>
            <h2 className="font-mono text-lg font-medium text-foreground">No scenes yet</h2>
            <p className="mt-1 max-w-sm font-mono text-sm text-muted-foreground">
              Upload a video to create your first 3D reconstruction.
            </p>
            <Button
              onClick={() => router.push("/")}
              className="mt-6 bg-primary text-primary-foreground hover:bg-primary/90 font-mono gap-2"
            >
              <Plus className="h-4 w-4" />
              Upload video
            </Button>
          </div>
        ) : visibleScenes.length === 0 && searchQuery ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <p className="font-mono text-sm text-muted-foreground">
              No scenes matching &ldquo;{searchQuery}&rdquo;
            </p>
            <button
              onClick={() => setSearchQuery("")}
              className="mt-2 font-mono text-sm text-primary underline hover:text-primary/80"
            >
              Clear search
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {visibleScenes.map((scene) => (
              <SceneCard key={scene.sceneId} scene={scene} />
            ))}
            <button
              onClick={() => router.push("/")}
              className="aspect-[4/3] rounded-xl border-2 border-dashed border-border hover:border-muted-foreground bg-card/50 flex flex-col items-center justify-center gap-3 transition-colors group"
            >
              <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center group-hover:bg-muted/80 transition-colors">
                <Plus className="h-6 w-6 text-muted-foreground" />
              </div>
              <span className="text-muted-foreground font-mono text-sm">Upload new</span>
            </button>
          </div>
        )}

        {hasMore && !loading && (
          <div className="mt-6 flex justify-center">
            <Button
              variant="outline"
              onClick={loadMore}
              disabled={loadingMore}
              className="font-mono text-muted-foreground border-border hover:text-foreground"
            >
              {loadingMore ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : null}
              Load more
            </Button>
          </div>
        )}
      </main>
    </div>
  )
}

function SceneCard({ scene }: { scene: SceneSummary }) {
  const router = useRouter()
  const api = useAPI()
  const [thumbnailFailed, setThumbnailFailed] = useState(false)
  const showThumbnail = !!scene.thumbnailUrl && !thumbnailFailed

  const handleClick = () => {
    if (scene.latestJobStatus === "complete") {
      router.push(`/scenes/${scene.sceneId}`)
    } else if (scene.latestJobStatus === "running" || scene.latestJobStatus === "queued") {
      router.push(`/jobs/${scene.latestJobId}`)
    } else if (scene.latestJobStatus === "failed") {
      router.push(`/scenes/${scene.sceneId}`)
    }
  }

  const handleRetry = async (e: React.MouseEvent) => {
    e.stopPropagation()
    try {
      const result = await api.rerunScene(scene.sceneId)
      router.push(`/jobs/${result.jobId}`)
    } catch (err) {
      console.error("[topolog] Failed to rerun scene:", err)
      toast.error("Failed to start re-run")
    }
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={handleClick}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); handleClick() } }}
      className={`
        aspect-[4/3] rounded-xl border border-border bg-card overflow-hidden text-left cursor-pointer
        transition-all hover:border-muted-foreground hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring
        ${scene.latestJobStatus === "failed" ? "opacity-70" : ""}
      `}
    >
      <div className="h-[60%] bg-muted/20 relative overflow-hidden">
        {showThumbnail ? (
          <Image
            src={scene.thumbnailUrl ?? ""}
            alt={`${scene.displayName} thumbnail`}
            fill
            unoptimized
            sizes="(min-width: 1024px) 33vw, (min-width: 768px) 50vw, 100vw"
            className="object-cover"
            onError={() => setThumbnailFailed(true)}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            {scene.latestJobStatus === "complete" ? (
              <div className="flex items-center gap-2 rounded-full bg-black/55 px-3 py-1.5 backdrop-blur-sm">
                <Check className="h-4 w-4 text-primary" />
                <span className="text-foreground font-mono text-xs">Complete</span>
              </div>
            ) : scene.latestJobStatus === "running" || scene.latestJobStatus === "queued" ? (
              <div className="flex items-center gap-2 rounded-full bg-black/55 px-3 py-1.5 backdrop-blur-sm">
                <Loader2 className="h-4 w-4 text-primary animate-spin" />
                <span className="text-foreground font-mono text-xs">Processing</span>
              </div>
            ) : (
              <div className="flex items-center gap-2 rounded-full bg-black/55 px-3 py-1.5 backdrop-blur-sm">
                <span className="text-destructive font-mono text-xs">Failed</span>
              </div>
            )}
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/35 via-transparent to-transparent" />
        {showThumbnail && (
          <div className="absolute inset-x-0 bottom-3 flex items-center justify-center">
            {scene.latestJobStatus === "complete" ? (
              <div className="flex items-center gap-2 rounded-full bg-black/55 px-3 py-1.5 backdrop-blur-sm">
                <Check className="h-4 w-4 text-primary" />
                <span className="text-foreground font-mono text-xs">Complete</span>
              </div>
            ) : scene.latestJobStatus === "running" || scene.latestJobStatus === "queued" ? (
              <div className="flex items-center gap-2 rounded-full bg-black/55 px-3 py-1.5 backdrop-blur-sm">
                <Loader2 className="h-4 w-4 text-primary animate-spin" />
                <span className="text-foreground font-mono text-xs">Processing</span>
              </div>
            ) : (
              <div className="flex items-center gap-2 rounded-full bg-black/55 px-3 py-1.5 backdrop-blur-sm">
                <span className="text-destructive font-mono text-xs">Failed</span>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="h-[40%] p-3 flex flex-col justify-between">
        <div className="flex items-start justify-between gap-2">
          <span className="text-foreground font-mono text-sm font-medium truncate">
            {scene.displayName}
          </span>
          <span className="text-xs font-mono px-1.5 py-0.5 rounded bg-muted text-muted-foreground shrink-0">
            v{scene.latestVersion}
          </span>
        </div>

        <div className="flex items-center justify-between">
          {scene.latestJobStatus === "complete" && scene.completedAt && (
            <span className="text-muted-foreground font-mono text-xs">
              {formatTimeAgo(scene.completedAt)}
            </span>
          )}

          {(scene.latestJobStatus === "running" || scene.latestJobStatus === "queued") && (
            <div className="flex items-center gap-2">
              <Loader2 className="h-3 w-3 text-primary animate-spin" />
              <span className="text-primary font-mono text-xs">{scene.progressPercent}%</span>
            </div>
          )}

          {scene.latestJobStatus === "failed" && (
            <div className="flex items-center gap-2">
              <span className="text-destructive font-mono text-xs">Failed</span>
              <button
                onClick={handleRetry}
                className="flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors"
              >
                <RefreshCw className="h-3 w-3" />
                <span className="font-mono text-xs">Retry</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
