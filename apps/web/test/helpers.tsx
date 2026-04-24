import React from "react"
import { render, type RenderOptions } from "@testing-library/react"
import { APIContext } from "@/lib/api"
import { mockClient } from "@topolog/sdk-ts"
import type { TopologAPI } from "@/lib/api"

interface WrapperProps {
  children: React.ReactNode
}

export function createWrapper(api: TopologAPI = mockClient) {
  return function Wrapper({ children }: WrapperProps) {
    return <APIContext.Provider value={api}>{children}</APIContext.Provider>
  }
}

export function renderWithAPI(
  ui: React.ReactElement,
  api: TopologAPI = mockClient,
  options?: Omit<RenderOptions, "wrapper">
) {
  return render(ui, { wrapper: createWrapper(api), ...options })
}
