import { describe, it, expect, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import "@/test/mocks"
import { Nav } from "./nav"

describe("Nav", () => {
  it("renders topolog brand and navigation links", () => {
    render(<Nav />)

    expect(screen.getByText("topolog")).toBeInTheDocument()
    expect(screen.getByText("Upload")).toBeInTheDocument()
    expect(screen.getByText("Library")).toBeInTheDocument()
  })

  it("links point to correct routes", () => {
    render(<Nav />)

    const links = screen.getAllByRole("link")
    const hrefs = links.map((a) => a.getAttribute("href"))
    expect(hrefs).toContain("/")
    expect(hrefs).toContain("/library")
  })
})
