import { describe, it, expect, vi, beforeEach } from "vitest"
import { screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import "@/test/mocks"
import { renderWithAPI } from "@/test/helpers"
import { mockRouter } from "@/test/mocks"
import { mockClient } from "@topolog/sdk-ts"
import UploadPage from "./page"

beforeEach(() => {
  vi.clearAllMocks()
})

describe("UploadPage", () => {
  it("renders the upload drop zone and CTA", async () => {
    renderWithAPI(<UploadPage />)

    expect(screen.getByText("Video to Simulation")).toBeInTheDocument()
    expect(screen.getByText(/Drop video file here/)).toBeInTheDocument()
    expect(screen.getByText("Start reconstruction")).toBeInTheDocument()
  })

  it("disables CTA when no file is selected", () => {
    renderWithAPI(<UploadPage />)

    const button = screen.getByRole("button", { name: /Start reconstruction/ })
    expect(button).toBeDisabled()
  })

  it("renders quality presets", () => {
    renderWithAPI(<UploadPage />)

    expect(screen.getByText("Fast")).toBeInTheDocument()
    expect(screen.getByText("Balanced")).toBeInTheDocument()
    expect(screen.getByText("High")).toBeInTheDocument()
  })

  it("renders output format checkboxes", () => {
    renderWithAPI(<UploadPage />)

    expect(screen.getByText("MJCF")).toBeInTheDocument()
    expect(screen.getByText("GLB")).toBeInTheDocument()
    expect(screen.getByText("PLY")).toBeInTheDocument()
  })

  it("enables CTA after file selection and navigates on submit", async () => {
    const user = userEvent.setup()
    const createJobSpy = vi.fn().mockResolvedValue({
      id: "job-123",
      sceneId: "scene-456",
    })
    const api = {
      ...mockClient,
      createJob: createJobSpy,
    }

    renderWithAPI(<UploadPage />, api)

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement
    expect(fileInput).toBeTruthy()

    const file = new File(["video-content"], "test-scene.mp4", { type: "video/mp4" })
    await user.upload(fileInput, file)

    await waitFor(() => {
      expect(screen.getByText("test-scene.mp4")).toBeInTheDocument()
    })

    const ctaButton = screen.getByRole("button", { name: /Start reconstruction/ })
    expect(ctaButton).not.toBeDisabled()

    await user.click(ctaButton)

    await waitFor(() => {
      expect(createJobSpy).toHaveBeenCalledOnce()
    })

    expect(mockRouter.push).toHaveBeenCalledWith("/jobs/job-123")
  })
})
