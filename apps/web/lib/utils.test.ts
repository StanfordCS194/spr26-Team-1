import { describe, it, expect } from "vitest"
import { formatFileSize, formatTimeAgo, formatDate, formatReconTime, psnrLabel, meshQualityLabel } from "./utils"

describe("formatFileSize", () => {
  it("formats bytes", () => expect(formatFileSize(500)).toBe("500 B"))
  it("formats kilobytes", () => expect(formatFileSize(2048)).toBe("2.0 KB"))
  it("formats megabytes", () => expect(formatFileSize(5 * 1024 * 1024)).toBe("5.0 MB"))
  it("formats gigabytes", () => expect(formatFileSize(2 * 1024 * 1024 * 1024)).toBe("2.0 GB"))
  it("handles zero", () => expect(formatFileSize(0)).toBe("0 B"))
})

describe("formatTimeAgo", () => {
  it("returns 'Just now' for recent timestamps", () => {
    expect(formatTimeAgo(new Date().toISOString())).toBe("Just now")
  })
  it("returns minutes ago", () => {
    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString()
    expect(formatTimeAgo(fiveMinAgo)).toBe("5m ago")
  })
  it("returns hours ago", () => {
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString()
    expect(formatTimeAgo(twoHoursAgo)).toBe("2h ago")
  })
  it("returns days ago", () => {
    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString()
    expect(formatTimeAgo(threeDaysAgo)).toBe("3d ago")
  })
})

describe("formatDate", () => {
  it("returns a locale string", () => {
    const result = formatDate("2026-01-15T10:30:00Z")
    expect(result).toBeTruthy()
    expect(typeof result).toBe("string")
  })
})

describe("formatReconTime", () => {
  it("returns N/A for null", () => expect(formatReconTime(null)).toBe("N/A"))
  it("returns N/A for undefined", () => expect(formatReconTime(undefined)).toBe("N/A"))
  it("handles zero seconds", () => expect(formatReconTime(0)).toBe("0m 0s"))
  it("formats minutes and seconds", () => expect(formatReconTime(125)).toBe("2m 5s"))
  it("formats large values", () => expect(formatReconTime(3661)).toBe("61m 1s"))
})

describe("psnrLabel", () => {
  it("returns — for null", () => expect(psnrLabel(null)).toBe("—"))
  it("returns — for undefined", () => expect(psnrLabel(undefined)).toBe("—"))
  it("returns fair for 0", () => expect(psnrLabel(0)).toBe("fair"))
  it("returns fair for low values", () => expect(psnrLabel(20)).toBe("fair"))
  it("returns good for 25-29", () => expect(psnrLabel(28)).toBe("good"))
  it("returns excellent for 30+", () => expect(psnrLabel(32)).toBe("excellent"))
  it("returns good at boundary 25", () => expect(psnrLabel(25)).toBe("good"))
  it("returns excellent at boundary 30", () => expect(psnrLabel(30)).toBe("excellent"))
})

describe("meshQualityLabel", () => {
  it("returns — for null", () => expect(meshQualityLabel(null)).toBe("—"))
  it("returns — for undefined", () => expect(meshQualityLabel(undefined)).toBe("—"))
  it("returns low for 0", () => expect(meshQualityLabel(0)).toBe("low"))
  it("returns low for values under 50", () => expect(meshQualityLabel(30)).toBe("low"))
  it("returns fair for 50-79", () => expect(meshQualityLabel(60)).toBe("fair"))
  it("returns good for 80+", () => expect(meshQualityLabel(90)).toBe("good"))
})
