import type React from "react"
import type { Metadata } from "next"
import "./globals.css"
import ClientLayout from "./client-layout"

export const metadata: Metadata = {
  title: "Topolog - 3D Scene Reconstruction",
  description: "Transform video into simulation-ready 3D assets. Generate MJCF, GLB, and PLY outputs from your footage.",
  icons: {
    icon: "/circular-logo.svg",
    shortcut: "/circular-logo.svg",
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className="bg-background">
      <body className="font-mono">
        <ClientLayout>{children}</ClientLayout>
      </body>
    </html>
  )
}
