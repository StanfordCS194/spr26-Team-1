"use client"

import { useEffect, useState, useCallback } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { Check, Circle, Loader2, X } from "lucide-react"
import { useAPI } from "@/lib/api"
import { ApiError } from "@topolog/sdk-ts"
import type { JobResponse, Stage } from "@topolog/contracts"
import { STAGE_LABELS } from "@topolog/contracts"
import { toast } from "sonner"

const POLL_INTERVAL = 2000

export default function JobProgressPage({ params }: { params: { id: string } }) {
  const { id } = params
  const router = useRouter()
  const api = useAPI()
  const [job, setJob] = useState<JobResponse | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    let pollTimeout: ReturnType<typeof setTimeout> | undefined

    const poll = async () => {
      try {
        const data = await api.getJob(id)
        if (!cancelled) {
          setJob(data)
          if (data.status === "complete" || data.status === "failed" || data.status === "cancelled") {
            return
          }
        }
      } catch (err) {
        if (!cancelled) {
          if (err instanceof ApiError && err.isNotFound) {
            setError("not_found")
          } else {
            setError("load_failed")
          }
        }
        return
      }

      if (!cancelled) {
        pollTimeout = setTimeout(poll, POLL_INTERVAL)
      }
    }

    poll()
    return () => {
      cancelled = true
      if (pollTimeout) {
        clearTimeout(pollTimeout)
      }
    }
  }, [id, api])

  const handleCancel = useCallback(async () => {
    try {
      await api.cancelJob(id)
      toast.success("Job cancelled")
      router.push("/library")
    } catch (err) {
      toast.error("Failed to cancel job")
      console.error("[topolog] Cancel failed:", err)
    }
  }, [api, id, router])

  if (error) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-2">
        <p className="text-muted-foreground font-mono">
          {error === "not_found" ? "Job not found" : "Failed to load job"}
        </p>
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

  if (!job) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-6 w-6 text-primary animate-spin" />
      </div>
    )
  }

  const completedStages = job.stages.filter((s) => s.status === "complete").length
  const totalStages = job.stages.length
  const progressPercent = (completedStages / totalStages) * 100

  // Calculate remaining time estimate
  const remainingStages = job.stages.filter((s) => s.status === "pending" || s.status === "running")
  const remainingMinutes = remainingStages.reduce((acc, s) => acc + s.estimatedDurationMinutes, 0)

  const formatElapsedTime = (
    startedAt?: string | null,
    completedAt?: string | null,
  ): string => {
    if (!startedAt) return ""
    const start = new Date(startedAt).getTime()
    const end = completedAt ? new Date(completedAt).getTime() : Date.now()
    const elapsed = Math.floor((end - start) / 1000)
    const mins = Math.floor(elapsed / 60)
    const secs = elapsed % 60
    return `${mins}m ${secs}s`
  }

  const sceneId = job.sceneId

  return (
    <div className="min-h-screen bg-background">
      <main className="max-w-2xl mx-auto px-6 py-10">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="font-mono text-lg font-medium text-foreground truncate max-w-[70%]">
            {job.filename}
          </h1>
          {job.status !== "complete" && job.status !== "failed" && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleCancel}
              className="text-muted-foreground border-border hover:text-destructive hover:border-destructive"
            >
              Cancel
            </Button>
          )}
        </div>
        {/* Progress Bar */}
        <div className="mb-10">
          <div className="flex items-center justify-between mb-2">
            <span className="text-muted-foreground font-mono text-sm">Overall progress</span>
            <span className="text-foreground font-mono text-sm font-medium">
              {Math.round(progressPercent)}%
            </span>
          </div>
          <Progress value={progressPercent} className="h-2" />
        </div>

        {/* Stage Tracker */}
        <div className="space-y-0 mb-10">
          {job.stages.map((stage, idx) => (
            <StageRow
              key={stage.name}
              stage={stage}
              isLast={idx === job.stages.length - 1}
              formatElapsedTime={formatElapsedTime}
            />
          ))}
        </div>

        {job.status === "failed" && (
          <div className="mb-10 rounded-xl border border-destructive/40 bg-destructive/5 px-4 py-3">
            <p className="font-mono text-sm text-destructive">
              {job.errorMessage ?? "The reconstruction pipeline failed."}
            </p>
            {job.errorCode && (
              <p className="mt-1 font-mono text-xs text-muted-foreground">code: {job.errorCode}</p>
            )}
          </div>
        )}

        {/* Pipeline Info */}
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
              {job.status === "complete" ? (
                <Check className="h-5 w-5 text-primary" />
              ) : job.status === "failed" ? (
                <X className="h-5 w-5 text-destructive" />
              ) : (
                <Loader2 className="h-5 w-5 text-primary animate-spin" />
              )}
            </div>
            <div>
              <p className="text-foreground font-mono text-sm font-medium">
                {job.status === "complete" ? "Reconstruction complete" :
                 job.status === "failed" ? "Reconstruction failed" :
                 "Processing pipeline"}
              </p>
              <p className="text-muted-foreground font-mono text-xs mt-0.5">
                {job.quality} quality &middot; {job.outputFormats.join(", ")}
              </p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-8 flex items-center justify-between">
          <span className="text-muted-foreground font-mono text-sm">
            {job.status === "complete" 
              ? "Reconstruction complete" 
              : `Estimated completion: ${remainingMinutes} min`
            }
          </span>
          {job.status === "complete" && sceneId && (
            <Button
              onClick={() => router.push(`/scenes/${sceneId}`)}
              className="bg-primary text-primary-foreground hover:bg-primary/90 font-mono gap-2"
            >
              View results
              <span>→</span>
            </Button>
          )}
        </div>
      </main>
    </div>
  )
}

function StageRow({
  stage,
  isLast,
  formatElapsedTime,
}: {
  stage: Stage
  isLast: boolean
  formatElapsedTime: (startedAt?: string | null, completedAt?: string | null) => string
}) {
  const label = STAGE_LABELS[stage.name] ?? stage.name

  return (
    <div className="flex items-start gap-4">
      {/* Status icon and line */}
      <div className="flex flex-col items-center">
        <div className="w-6 h-6 flex items-center justify-center">
          {stage.status === "complete" ? (
            <div className="w-5 h-5 rounded-full bg-primary flex items-center justify-center">
              <Check className="h-3 w-3 text-primary-foreground" />
            </div>
          ) : stage.status === "running" ? (
            <Loader2 className="h-5 w-5 text-primary animate-spin" />
          ) : stage.status === "failed" ? (
            <div className="w-5 h-5 rounded-full bg-destructive flex items-center justify-center">
              <X className="h-3 w-3 text-destructive-foreground" />
            </div>
          ) : (
            <Circle className="h-5 w-5 text-muted-foreground" />
          )}
        </div>
        {!isLast && (
          <div className={`w-px h-8 ${stage.status === "complete" ? "bg-primary" : "bg-border"}`} />
        )}
      </div>

      {/* Stage info */}
      <div className="flex-1 flex items-center justify-between pb-8">
        <span
          className={`font-mono ${
            stage.status === "complete"
              ? "text-foreground"
              : stage.status === "running"
              ? "text-primary"
              : stage.status === "failed"
              ? "text-destructive"
              : "text-muted-foreground"
          }`}
        >
          {label}
        </span>
        <span className={`font-mono text-sm ${stage.status === "failed" ? "text-destructive" : "text-muted-foreground"}`}>
          {stage.status === "complete"
            ? formatElapsedTime(stage.startedAt, stage.completedAt)
            : stage.status === "running"
            ? "running..."
            : stage.status === "failed"
            ? "failed"
            : `~${stage.estimatedDurationMinutes}min`}
        </span>
      </div>
    </div>
  )
}
