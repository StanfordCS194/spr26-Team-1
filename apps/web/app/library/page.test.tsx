import { describe, it, expect, vi, beforeEach } from "vitest"
import { screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import "@/test/mocks"
import { renderWithAPI } from "@/test/helpers"
import { mockRouter } from "@/test/mocks"
import LibraryPage from "./page"

beforeEach(() => {
  vi.clearAllMocks()
})

describe("LibraryPage", () => {
  it("renders the search input and new scene button", async () => {
    renderWithAPI(<LibraryPage />)

    expect(screen.getByPlaceholderText("Search scenes...")).toBeInTheDocument()
    expect(screen.getByText("New scene")).toBeInTheDocument()
  })

  it("shows scene count after loading", async () => {
    renderWithAPI(<LibraryPage />)

    await waitFor(() => {
      const scenesLabel = screen.getByText(/Scenes \(/)
      expect(scenesLabel).toBeInTheDocument()
    })
  })

  it("navigates to upload when New scene is clicked", async () => {
    const user = userEvent.setup()
    renderWithAPI(<LibraryPage />)

    const newBtn = screen.getByText("New scene")
    await user.click(newBtn)

    expect(mockRouter.push).toHaveBeenCalledWith("/")
  })

  it("shows scene cards from seeded mock data", async () => {
    renderWithAPI(<LibraryPage />)

    await waitFor(() => {
      expect(screen.getAllByText("Complete").length).toBeGreaterThanOrEqual(1)
    })
  })

  it("filters scenes by search query", async () => {
    const user = userEvent.setup()
    renderWithAPI(<LibraryPage />)

    await waitFor(() => {
      expect(screen.getByText(/Scenes \(/)).toBeInTheDocument()
    })

    const searchInput = screen.getByPlaceholderText("Search scenes...")
    await user.type(searchInput, "zzz-nonexistent-scene")

    await waitFor(() => {
      expect(screen.getByText(/No scenes matching/)).toBeInTheDocument()
    })
  })
})
