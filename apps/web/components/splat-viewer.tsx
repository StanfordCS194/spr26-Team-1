"use client"

import { useEffect, useRef, useState } from "react"
import * as THREE from "three"
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js"
import { SplatMesh, SplatFileType, SparkRenderer } from "@sparkjsdev/spark"

interface SplatViewerProps {
  plyUrl?: string
  className?: string
}

type ViewerStatus = "loading" | "ready" | "pending" | "unavailable"

/**
 * Render a Gaussian splat PLY with Spark.
 */
export function SplatViewer({ plyUrl, className = "" }: SplatViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [status, setStatus] = useState<ViewerStatus>(plyUrl ? "loading" : "pending")
  const [splatCount, setSplatCount] = useState<number | null>(null)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    if (!plyUrl) {
      setStatus("pending")
      return
    }

    let disposed = false
    const width = container.clientWidth
    const height = container.clientHeight || 400
    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0x0f1117)

    const camera = new THREE.PerspectiveCamera(45, width / height, 0.01, 500)
    camera.position.set(0, 1, 3)
    camera.lookAt(0, 0, 0)

    // Environments without a WebGL context (e.g. jsdom during vitest) should
    // degrade to "unavailable" instead of throwing.
    let renderer: THREE.WebGLRenderer
    try {
      // Spark recommends antialias:false — WebGL MSAA doesn't help splat
      // rendering and measurably hurts performance (per SparkRenderer docs).
      renderer = new THREE.WebGLRenderer({ antialias: false })
    } catch {
      setStatus("unavailable")
      return
    }
    renderer.setSize(width, height)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.outputColorSpace = THREE.SRGBColorSpace
    // Opaque dark background — Spark's premultiplied-alpha blending otherwise
    // leaves us with transparent black when scene.background is a THREE.Color.
    renderer.setClearColor(0x080a0f, 1)
    container.appendChild(renderer.domElement)

    // Spark requires an explicit SparkRenderer orchestrator added to the scene
    // so it can bridge the WebGLRenderer with SplatMesh nodes. Without this,
    // SplatMesh objects silently render nothing (the canvas stays blank).
    const spark = new SparkRenderer({ renderer })
    scene.add(spark)

    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.dampingFactor = 0.08
    controls.minDistance = 0.01
    controls.maxDistance = 200

    // Ambient is enough for PBR-ish fill; splat colors are baked from the radiance field.
    const ambient = new THREE.AmbientLight(0xffffff, 0.5)
    scene.add(ambient)

    // Topolog serves PLYs at /artifacts/{uuid} without file extension. Spark's
    // format auto-detect would then fail — pass fileType explicitly so the loader
    // treats the stream as PLY regardless of URL shape.
    let splat: SplatMesh | null = null
    try {
      splat = new SplatMesh({
        url: plyUrl,
        fileType: SplatFileType.PLY,
        onLoad: (mesh: SplatMesh) => {
          if (disposed) return
          // Spark's packed splats expose positions directly, so compute bounds
          // from those points instead of relying on geometry.boundingBox.
          const box = new THREE.Box3()
          mesh.packedSplats?.forEachSplat(
            (_i: number, c: THREE.Vector3) => {
              box.expandByPoint(c)
            },
          )
          if (box.isEmpty()) {
            box.setFromCenterAndSize(
              new THREE.Vector3(0, 0, 0),
              new THREE.Vector3(1, 1, 1),
            )
          }
          const center = box.getCenter(new THREE.Vector3())
          const size = box.getSize(new THREE.Vector3())
          const maxDim = Math.max(size.x, size.y, size.z, 0.5)
          const fitDistance = (maxDim / 2) / Math.tan((camera.fov * Math.PI) / 360)
          const camOffset = new THREE.Vector3(
            0,
            maxDim * 0.35,
            fitDistance * 1.8,
          )
          camera.position.copy(center).add(camOffset)
          camera.near = Math.max(0.001, maxDim / 1000)
          camera.far = Math.max(500, maxDim * 50)
          camera.updateProjectionMatrix()
          controls.target.copy(center)
          controls.minDistance = Math.max(0.001, maxDim / 100)
          controls.maxDistance = maxDim * 50
          controls.update()

          setSplatCount(mesh.numSplats ?? null)
          setStatus("ready")
        },
      })
      scene.add(splat)
    } catch (err) {
      console.error("[topolog] SplatViewer constructor threw:", err)
      setStatus("unavailable")
      return
    }

    // Surface initialization failures that fall through the Promise chain.
    splat.initialized.catch((err: unknown) => {
      if (disposed) return
      console.error("[topolog] SplatViewer failed to load PLY:", err)
      setStatus("unavailable")
    })

    let animId = 0
    const animate = () => {
      if (disposed) return
      animId = requestAnimationFrame(animate)
      controls.update()
      renderer.render(scene, camera)
    }
    animate()

    const handleResize = () => {
      if (!container || disposed) return
      const w = container.clientWidth
      const h = container.clientHeight || 400
      camera.aspect = w / h
      camera.updateProjectionMatrix()
      renderer.setSize(w, h)
    }
    const resizeObserver = new ResizeObserver(handleResize)
    resizeObserver.observe(container)

    return () => {
      disposed = true
      cancelAnimationFrame(animId)
      resizeObserver.disconnect()
      controls.dispose()
      if (splat) {
        scene.remove(splat)
        try {
          splat.packedSplats?.dispose?.()
        } catch {
          // best-effort; Spark's PackedSplats release their GPU texture here.
        }
      }
      // forceContextLoss before dispose to avoid StrictMode double-mount leaks
      // (the prior Viewer's sort worker still referenced the old GL context).
      try {
        renderer.forceContextLoss()
      } catch {
        // fallback: some runtimes don't expose forceContextLoss
      }
      renderer.dispose()
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement)
      }
    }
  }, [plyUrl])

  return (
    <div className={`relative w-full ${className}`}>
      <div
        ref={containerRef}
        className="h-full min-h-[360px] w-full overflow-hidden bg-[#080a0f]"
      />

      {status === "loading" && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <span className="text-xs font-mono text-muted-foreground px-3 py-1.5 rounded-md bg-background/80 backdrop-blur-sm">
            Loading splat&hellip;
          </span>
        </div>
      )}

      {status === "pending" && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <span className="text-xs font-mono text-muted-foreground px-3 py-1.5 rounded-md bg-background/80 backdrop-blur-sm">
            Splat pending &mdash; reconstruction in progress
          </span>
        </div>
      )}

      {status === "unavailable" && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <span className="text-xs font-mono text-muted-foreground px-3 py-1.5 rounded-md bg-background/80 backdrop-blur-sm">
            Splat unavailable &mdash; see job logs
          </span>
        </div>
      )}

      {status === "ready" && (
        <div className="absolute bottom-3 left-3 rounded-md bg-black/60 px-3 py-1.5 backdrop-blur-sm">
          <span className="font-mono text-xs text-zinc-300">
            {splatCount !== null ? `${splatCount.toLocaleString()} gaussians` : "gaussians"}
          </span>
        </div>
      )}
    </div>
  )
}
