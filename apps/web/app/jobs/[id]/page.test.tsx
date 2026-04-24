import { describe, it, expect, vi, beforeEach } from "vitest"
import { screen, waitFor } from "@testing-library/react"
import "@/test/mocks"
import { renderWithAPI } from "@/test/helpers"
import { mockClient } from "@topolog/sdk-ts"
import JobProgressPage from "./page"

beforeEach(() => {
  vi.clearAllMocks()
})

describe("JobProgressPage", () => {
  it("shows loading spinner initially", () => {
    renderWithAPI(<JobProgressPage params={{ id: "nonexistent" }} />)
    // The spinner is rendered while polling
    expect(document.querySelector(".animate-spin")).toBeInTheDocument()
  })

  it("shows error when job not found", async () => {
    renderWithAPI(<JobProgressPage params={{ id: "does-not-exist" }} />)

    await waitFor(() => {
      expect(screen.getByText("Job not found")).toBeInTheDocument()
    })
  })

  it("renders job filename and stages when found", async () => {
    const { id } = await mockClient.createJob({
      filename: "test-render.mp4",
      fileSize: 1_000_000,
      quality: "fast",
      outputFormats: ["PLY"],
    })

    renderWithAPI(<JobProgressPage params={{ id }} />)

    await waitFor(() => {
      expect(screen.getByText("test-render.mp4")).toBeInTheDocument()
    })

    await waitFor(() => {
      expect(screen.getByText("Pose estimation")).toBeInTheDocument()
      expect(screen.getByText("Reconstruction")).toBeInTheDocument()
    })
  })

  it("shows progress bar", async () => {
    const { id } = await mockClient.createJob({
      filename: "progress-bar-test.mp4",
      fileSize: 500_000,
      quality: "balanced",
      outputFormats: ["PLY"],
    })

    renderWithAPI(<JobProgressPage params={{ id }} />)

    await waitFor(() => {
      expect(screen.getByText("Overall progress")).toBeInTheDocument()
    })
  })
})
