"use client"

import { useState, useCallback, useRef } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { Upload, File, ArrowRight, Loader2 } from "lucide-react"
import { useAPI } from "@/lib/api"
import type { QualityPreset, OutputFormat } from "@topolog/contracts"
import { formatFileSize } from "@/lib/utils"
import { toast } from "sonner"

const ACCEPTED_FORMATS = ".mp4,.mov,.avi"
const MAX_FILE_SIZE_BYTES = 2 * 1024 * 1024 * 1024

export default function UploadPage() {
  const router = useRouter()
  const api = useAPI()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [quality, setQuality] = useState<QualityPreset>("balanced")
  const [outputFormats, setOutputFormats] = useState<OutputFormat[]>(["MJCF", "GLB", "PLY"])
  const [isDragging, setIsDragging] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const isAcceptedVideoFile = useCallback((file: File) => {
    return /\.(mp4|mov|avi)$/i.test(file.name)
  }, [])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    const file = e.dataTransfer.files[0]
    if (!file || !isAcceptedVideoFile(file)) {
      toast.error("Please select an MP4, MOV, or AVI video file.")
      return
    }
    if (file.size > MAX_FILE_SIZE_BYTES) {
      toast.error("File is too large. Maximum size is 2 GB.")
      return
    }
    setSelectedFile(file)
  }, [isAcceptedVideoFile])

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      if (!isAcceptedVideoFile(file)) {
        e.target.value = ""
        toast.error("Please select an MP4, MOV, or AVI video file.")
        return
      }
      if (file.size > MAX_FILE_SIZE_BYTES) {
        e.target.value = ""
        toast.error("File is too large. Maximum size is 2 GB.")
        return
      }
      setSelectedFile(file)
    }
  }, [isAcceptedVideoFile])

  const handleFormatToggle = useCallback((format: OutputFormat, checked: boolean) => {
    if (checked) {
      setOutputFormats((prev) => (prev.includes(format) ? prev : [...prev, format]))
    } else {
      setOutputFormats((prev) => {
        if (prev.length === 1 && prev.includes(format)) {
          toast.error("Select at least one output format.")
          return prev
        }
        return prev.filter((f) => f !== format)
      })
    }
  }, [])

  const handleStartReconstruction = useCallback(async () => {
    if (!selectedFile || isSubmitting) return
    if (outputFormats.length === 0) {
      toast.error("Select at least one output format.")
      return
    }
    setIsSubmitting(true)

    try {
      const result = await api.createJob({
        file: selectedFile,
        filename: selectedFile.name,
        fileSize: selectedFile.size,
        quality,
        outputFormats,
      })
      router.push(`/jobs/${result.id}`)
    } catch (err) {
      console.error("[topolog] Failed to create job:", err)
      toast.error("Failed to start reconstruction. Please try again.")
      setIsSubmitting(false)
    }
  }, [selectedFile, quality, outputFormats, api, router, isSubmitting])

  return (
    <div className="min-h-screen bg-background">
      <main className="flex flex-col items-center justify-center px-6 py-12 max-w-2xl mx-auto">
        <div className="mb-8 text-center">
          <h1 className="font-mono text-2xl font-semibold text-foreground">
            Video to Simulation
          </h1>
          <p className="mt-2 font-mono text-sm text-muted-foreground">
            Upload a video and get physics-ready MJCF, mesh, and point cloud assets.
          </p>
        </div>
        {/* Drop Zone */}
        <div
          onClick={() => fileInputRef.current?.click()}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={`
            w-full border-2 border-dashed rounded-xl p-12 text-center cursor-pointer
            transition-all duration-200
            ${isDragging 
              ? "border-primary bg-primary/5" 
              : selectedFile 
                ? "border-primary/50 bg-card" 
                : "border-border hover:border-muted-foreground bg-card"
            }
          `}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept={ACCEPTED_FORMATS}
            onChange={handleFileSelect}
            className="hidden"
          />
          
          {selectedFile ? (
            <div className="flex flex-col items-center gap-3">
              <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                <File className="h-6 w-6 text-primary" />
              </div>
              <div>
                <p className="text-foreground font-mono font-medium">{selectedFile.name}</p>
                <p className="text-muted-foreground font-mono text-sm mt-1">
                  {formatFileSize(selectedFile.size)}
                </p>
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  setSelectedFile(null)
                }}
                className="text-muted-foreground hover:text-foreground text-sm font-mono underline"
              >
                Choose different file
              </button>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-3">
              <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center">
                <Upload className="h-6 w-6 text-muted-foreground" />
              </div>
              <div>
                <p className="text-foreground font-mono font-medium">
                  Drop video file here or click to browse
                </p>
                <p className="text-muted-foreground font-mono text-sm mt-1">
                  Supports MP4, MOV, AVI
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Configuration Sections */}
        <div className="w-full mt-10 space-y-8">
          {/* Quality */}
          <div className="space-y-4">
            <h3 className="text-foreground font-mono font-medium text-sm uppercase tracking-wider">
              Quality
            </h3>
            <RadioGroup
              value={quality}
              onValueChange={(v) => setQuality(v as QualityPreset)}
              className="flex flex-col gap-3"
            >
              <div className="flex items-center gap-3 p-3 rounded-lg border border-border bg-card hover:border-muted-foreground transition-colors">
                <RadioGroupItem value="fast" id="fast" />
                <Label htmlFor="fast" className="flex-1 cursor-pointer">
                  <span className="font-mono text-foreground">Fast</span>
                  <span className="font-mono text-muted-foreground ml-2">(~12 min)</span>
                </Label>
              </div>
              <div className="flex items-center gap-3 p-3 rounded-lg border border-border bg-card hover:border-muted-foreground transition-colors">
                <RadioGroupItem value="balanced" id="balanced" />
                <Label htmlFor="balanced" className="flex-1 cursor-pointer">
                  <span className="font-mono text-foreground">Balanced</span>
                  <span className="font-mono text-muted-foreground ml-2">(~25 min)</span>
                </Label>
              </div>
              <div className="flex items-center gap-3 p-3 rounded-lg border border-border bg-card hover:border-muted-foreground transition-colors">
                <RadioGroupItem value="high" id="high" />
                <Label htmlFor="high" className="flex-1 cursor-pointer">
                  <span className="font-mono text-foreground">High</span>
                  <span className="font-mono text-muted-foreground ml-2">(~38 min)</span>
                </Label>
              </div>
            </RadioGroup>
          </div>

          {/* Outputs */}
          <div className="space-y-4">
            <h3 className="text-foreground font-mono font-medium text-sm uppercase tracking-wider">
              Outputs
            </h3>
            <div className="flex flex-wrap gap-4">
              {(["MJCF", "GLB", "PLY"] as OutputFormat[]).map((format) => (
                <div
                  key={format}
                  className="flex items-center gap-2 p-3 rounded-lg border border-border bg-card"
                >
                  <Checkbox
                    id={format}
                    checked={outputFormats.includes(format)}
                    onCheckedChange={(checked) => handleFormatToggle(format, checked as boolean)}
                  />
                  <Label htmlFor={format} className="font-mono text-foreground cursor-pointer">
                    {format}
                  </Label>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* CTA Button */}
        <Button
          onClick={handleStartReconstruction}
          disabled={!selectedFile || isSubmitting}
          className="w-full mt-10 h-14 bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed font-mono text-base gap-2"
        >
          {isSubmitting ? (
            <>
              <Loader2 className="h-5 w-5 animate-spin" />
              Starting reconstruction...
            </>
          ) : (
            <>
              Start reconstruction
              <ArrowRight className="h-5 w-5" />
            </>
          )}
        </Button>
      </main>
    </div>
  )
}
