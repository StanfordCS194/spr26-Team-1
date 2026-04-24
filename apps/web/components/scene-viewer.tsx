"use client"

import { useEffect, useRef, useState } from "react"
import * as THREE from "three"
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js"
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js"
import { OBJLoader } from "three/examples/jsm/loaders/OBJLoader.js"

interface SceneViewerProps {
  glbUrl?: string
  objUrl?: string
  className?: string
}

type ViewerStatus = "loading" | "ready" | "unavailable" | "pending"

export function SceneViewer({ glbUrl, objUrl, className = "" }: SceneViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null)
  const [status, setStatus] = useState<ViewerStatus>(glbUrl || objUrl ? "loading" : "pending")

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const modelUrl = glbUrl || objUrl
    if (!modelUrl) {
      setStatus("pending")
      return
    }

    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0x0f1117)

    const camera = new THREE.PerspectiveCamera(45, container.clientWidth / container.clientHeight, 0.01, 100)
    camera.position.set(2.5, 2, 2.5)
    camera.lookAt(0, 0, 0)

    const renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setSize(container.clientWidth, container.clientHeight)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.05
    renderer.setClearColor(0x080a0f, 1)
    container.appendChild(renderer.domElement)
    rendererRef.current = renderer

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5)
    scene.add(ambientLight)
    const dirLight = new THREE.DirectionalLight(0xffffff, 0.8)
    dirLight.position.set(5, 5, 5)
    scene.add(dirLight)
    const fillLight = new THREE.DirectionalLight(0xffffff, 0.3)
    fillLight.position.set(-3, 2, -3)
    scene.add(fillLight)

    const grid = new THREE.GridHelper(6, 12, 0x1e2030, 0x1a1c2a)
    grid.position.y = -1.2
    scene.add(grid)

    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.dampingFactor = 0.08
    controls.minDistance = 0.5
    controls.maxDistance = 20

    function fitToView(object: THREE.Object3D) {
      const box = new THREE.Box3().setFromObject(object)
      const size = box.getSize(new THREE.Vector3())
      const center = box.getCenter(new THREE.Vector3())
      const maxDim = Math.max(size.x, size.y, size.z)
      if (maxDim > 0) {
        const scale = 2 / maxDim
        object.scale.setScalar(scale)
        object.position.set(-center.x * scale, -center.y * scale, -center.z * scale)
      }
    }

    const onLoad = (object: THREE.Object3D) => {
      object.traverse((child) => {
        if ((child as THREE.Mesh).isMesh) {
          const mesh = child as THREE.Mesh
          if (mesh.geometry && !mesh.geometry.getAttribute("normal")) {
            mesh.geometry.computeVertexNormals()
          }
          if (!mesh.material) {
            mesh.material = new THREE.MeshStandardMaterial({
              color: 0x8888cc,
              roughness: 0.6,
              metalness: 0.1,
              side: THREE.DoubleSide,
            })
          }
        }
      })
      fitToView(object)
      scene.add(object)
      setStatus("ready")
    }

    const onError = () => {
      setStatus("unavailable")
    }

    if (glbUrl) {
      new GLTFLoader().load(glbUrl, (gltf) => onLoad(gltf.scene), undefined, onError)
    } else if (objUrl) {
      new OBJLoader().load(objUrl, onLoad, undefined, onError)
    }

    let animId: number
    const animate = () => {
      animId = requestAnimationFrame(animate)
      controls.update()
      renderer.render(scene, camera)
    }
    animate()

    const handleResize = () => {
      if (!container) return
      const w = container.clientWidth
      const h = container.clientHeight
      camera.aspect = w / h
      camera.updateProjectionMatrix()
      renderer.setSize(w, h)
    }
    const resizeObserver = new ResizeObserver(handleResize)
    resizeObserver.observe(container)

    return () => {
      cancelAnimationFrame(animId)
      resizeObserver.disconnect()
      controls.dispose()
      scene.traverse((obj) => {
        if ((obj as THREE.Mesh).isMesh) {
          const mesh = obj as THREE.Mesh
          mesh.geometry?.dispose()
          const mat = mesh.material
          if (Array.isArray(mat)) mat.forEach((m) => m.dispose())
          else if (mat) mat.dispose()
        }
      })
      renderer.dispose()
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement)
      }
    }
  }, [glbUrl, objUrl])

  return (
    <div className={`relative w-full ${className}`}>
      <div ref={containerRef} className="h-full min-h-[360px] w-full overflow-hidden bg-[#080a0f]" />

      {status === "pending" && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <span className="text-xs font-mono text-muted-foreground px-3 py-1.5 rounded-md bg-background/80 backdrop-blur-sm">
            Mesh pending — reconstruction in progress
          </span>
        </div>
      )}

      {status === "unavailable" && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <span className="text-xs font-mono text-muted-foreground px-3 py-1.5 rounded-md bg-background/80 backdrop-blur-sm">
            Mesh unavailable — see job logs
          </span>
        </div>
      )}

      {status === "ready" && (
        <div className="absolute bottom-3 left-3 rounded-md bg-black/60 px-3 py-1.5 backdrop-blur-sm">
          <span className="font-mono text-xs text-zinc-300">
            simulation mesh
          </span>
        </div>
      )}
    </div>
  )
}
