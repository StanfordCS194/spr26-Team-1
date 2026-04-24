import { describe, it, expect } from "vitest"
import fs from "node:fs"
import path from "node:path"

const sourcePath = path.resolve(__dirname, "scene-viewer.tsx")
const source = fs.readFileSync(sourcePath, "utf8")

describe("SceneViewer", () => {
  it("does not contain the demo-mesh function", () => {
    expect(source).not.toMatch(/function\s+addDemoMesh\b/)
  })

  it("does not render hardcoded floor/box/cylinder/wall/sphere primitives", () => {
    expect(source).not.toMatch(/BoxGeometry\(\s*3\s*,\s*0\.1\s*,\s*3\s*\)/)
    expect(source).not.toMatch(/CylinderGeometry\(\s*0\.25\s*,\s*0\.25\s*,\s*0\.7/)
    expect(source).not.toMatch(/SphereGeometry\(\s*0\.3\s*,/)
  })

  it('does not expose a "demo" status (should be "pending" or "unavailable" instead)', () => {
    expect(source).not.toMatch(/setStatus\(\s*["']demo["']\s*\)/)
    expect(source).not.toMatch(/status\s*===\s*["']demo["']/)
  })

  it("does not contain the demo-preview user-facing label", () => {
    expect(source).not.toMatch(/Demo preview/i)
    expect(source).not.toMatch(/upload a video to generate a real mesh/i)
  })

  it('has an explicit "pending" or "unavailable" status for no-artifact state', () => {
    expect(source).toMatch(/pending|unavailable/i)
  })
})
