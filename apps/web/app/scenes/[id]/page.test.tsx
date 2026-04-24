import { describe, it, expect, vi, beforeEach } from "vitest"
import { screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import "@/test/mocks"
import { renderWithAPI } from "@/test/helpers"
import { mockRouter } from "@/test/mocks"
import { mockClient } from "@topolog/sdk-ts"
import SceneResultPage from "./page"

beforeEach(() => {
  vi.clearAllMocks()
})

async function getCompletedSceneId(): Promise<string> {
  const scenes = await mockClient.listScenes()
  const completed = scenes.scenes.find((s) => s.latestJobStatus === "complete")
  expect(completed, "Mock store must have at least one completed scene for these tests").toBeTruthy()
  return completed!.sceneId
}

describe("SceneResultPage", () => {
  it("shows 'Scene not found' for invalid id", async () => {
    renderWithAPI(<SceneResultPage params={{ id: "nonexistent-id" }} />)

    await waitFor(() => {
      expect(screen.getByText("Scene not found")).toBeInTheDocument()
    })
  })

  it("shows 'Failed to load scene' for API errors", async () => {
    const brokenApi = {
      ...mockClient,
      getScene: vi.fn().mockRejectedValue(new Error("Network error")),
      listScenes: mockClient.listScenes,
      createJob: mockClient.createJob,
      getJob: mockClient.getJob,
      cancelJob: mockClient.cancelJob,
      rerunScene: mockClient.rerunScene,
      deleteScene: mockClient.deleteScene,
    }

    renderWithAPI(<SceneResultPage params={{ id: "some-id" }} />, brokenApi)

    await waitFor(() => {
      expect(screen.getByText("Failed to load scene")).toBeInTheDocument()
    })
  })

  it("renders scene detail with quality metrics for completed scene", async () => {
    const sceneId = await getCompletedSceneId()
    renderWithAPI(<SceneResultPage params={{ id: sceneId }} />)

    await waitFor(() => {
      expect(screen.getByText("Quality Scores")).toBeInTheDocument()
      expect(screen.getByText("Scene Stats")).toBeInTheDocument()
      expect(screen.getByText("Downloads")).toBeInTheDocument()
      expect(screen.getByText("Metadata")).toBeInTheDocument()
    })
  })

  it("renders radiance preview label", async () => {
    const sceneId = await getCompletedSceneId()
    renderWithAPI(<SceneResultPage params={{ id: sceneId }} />)

    await waitFor(() => {
      expect(screen.getByText("Radiance preview")).toBeInTheDocument()
    })
  })

  it("shows delete and re-run buttons", async () => {
    const sceneId = await getCompletedSceneId()
    renderWithAPI(<SceneResultPage params={{ id: sceneId }} />)

    await waitFor(() => {
      expect(screen.getByText("Re-run")).toBeInTheDocument()
      expect(screen.getByText("Delete")).toBeInTheDocument()
    })
  })

  it("shows delete confirmation dialog when Delete is clicked", async () => {
    const sceneId = await getCompletedSceneId()
    const user = userEvent.setup()
    renderWithAPI(<SceneResultPage params={{ id: sceneId }} />)

    await waitFor(() => {
      expect(screen.getByText("Delete")).toBeInTheDocument()
    })

    await user.click(screen.getByText("Delete"))

    await waitFor(() => {
      expect(screen.getByText("Delete scene")).toBeInTheDocument()
      expect(screen.getByText(/permanently delete/)).toBeInTheDocument()
    })
  })

  it("calls deleteScene and navigates on delete confirmation", async () => {
    const sceneId = await getCompletedSceneId()
    const deleteSceneSpy = vi.fn().mockResolvedValue(undefined)
    const api = { ...mockClient, deleteScene: deleteSceneSpy }

    const user = userEvent.setup()
    renderWithAPI(<SceneResultPage params={{ id: sceneId }} />, api)

    await waitFor(() => {
      expect(screen.getByText("Delete")).toBeInTheDocument()
    })

    await user.click(screen.getByText("Delete"))

    await waitFor(() => {
      expect(screen.getByText("Delete scene")).toBeInTheDocument()
    })

    const confirmButtons = screen.getAllByRole("button", { name: /Delete/i })
    const confirmBtn = confirmButtons.find(
      (btn) => btn.textContent === "Delete" && btn.closest("[role='alertdialog']")
    )
    expect(confirmBtn).toBeTruthy()
    await user.click(confirmBtn!)

    await waitFor(() => {
      expect(deleteSceneSpy).toHaveBeenCalledWith(sceneId)
    })
    expect(mockRouter.push).toHaveBeenCalledWith("/library")
  })

  it("calls rerunScene and navigates on Re-run click", async () => {
    const sceneId = await getCompletedSceneId()
    const rerunSpy = vi.fn().mockResolvedValue({ jobId: "new-job-123" })
    const api = { ...mockClient, rerunScene: rerunSpy }

    const user = userEvent.setup()
    renderWithAPI(<SceneResultPage params={{ id: sceneId }} />, api)

    await waitFor(() => {
      expect(screen.getByText("Re-run")).toBeInTheDocument()
    })

    await user.click(screen.getByText("Re-run"))

    await waitFor(() => {
      expect(rerunSpy).toHaveBeenCalledWith(sceneId)
    })
    expect(mockRouter.push).toHaveBeenCalledWith("/jobs/new-job-123")
  })
})
