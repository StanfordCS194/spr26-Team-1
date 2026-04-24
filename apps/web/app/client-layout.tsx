"use client"

import { Suspense, useEffect, useMemo, useState } from "react"
import React from "react"
import { Toaster } from "@/components/ui/sonner"
import { APIContext, AppModeContext, type AppMode } from "@/lib/api"
import { Nav } from "@/components/nav"
import { mockClient, TopologClient } from "@topolog/sdk-ts"

class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error: Error | null }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("[topolog] Error boundary caught:", error, errorInfo)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background px-6">
          <p className="font-mono text-lg text-destructive">Something went wrong</p>
          <p className="max-w-md text-center font-mono text-sm text-muted-foreground">
            {this.state.error?.message ?? "An unexpected error occurred."}
          </p>
          <button
            onClick={() => {
              this.setState({ hasError: false, error: null })
              window.location.href = "/"
            }}
            className="mt-2 rounded-md bg-primary px-4 py-2 font-mono text-sm text-primary-foreground hover:bg-primary/90"
          >
            Return home
          </button>
        </div>
      )
    }

    return this.props.children
  }
}

export default function ClientLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  const baseUrl = process.env.NEXT_PUBLIC_TOPOLOG_API_BASE_URL?.trim() || ""
  const liveAvailable = !!baseUrl
  const [mode, setMode] = useState<AppMode>(liveAvailable ? "live" : "demo")

  useEffect(() => {
    if (typeof window === "undefined") return
    const saved = window.localStorage.getItem("topolog-mode")
    if (saved === "demo" || saved === "live") {
      if (saved === "live" && !liveAvailable) {
        setMode("demo")
      } else {
        setMode(saved)
      }
    }
  }, [liveAvailable])

  useEffect(() => {
    if (typeof window === "undefined") return
    window.localStorage.setItem("topolog-mode", mode)
  }, [mode])

  const api = useMemo(() => {
    if (mode === "live" && liveAvailable) {
      return new TopologClient({ baseUrl })
    }
    return mockClient
  }, [baseUrl, liveAvailable, mode])

  return (
    <ErrorBoundary>
      <AppModeContext.Provider value={{ mode, setMode, liveAvailable }}>
        <APIContext.Provider value={api}>
          <Nav />
          <Suspense
            fallback={
              <div className="flex min-h-screen items-center justify-center bg-background">
                <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              </div>
            }
          >
            {children}
          </Suspense>
          <Toaster />
        </APIContext.Provider>
      </AppModeContext.Provider>
    </ErrorBoundary>
  )
}
