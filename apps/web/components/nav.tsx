"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useAppMode } from "@/lib/api"

const navItems = [
  { href: "/", label: "Upload" },
  { href: "/library", label: "Library" },
]

export function Nav() {
  const pathname = usePathname()
  const isJobOrScene = pathname.startsWith("/jobs/") || pathname.startsWith("/scenes/")
  const { mode, setMode, liveAvailable } = useAppMode()

  return (
    <header className="sticky top-0 z-50 flex items-center justify-between border-b border-border bg-background/80 px-6 py-3 backdrop-blur-sm">
      <Link
        href="/"
        className="text-foreground font-mono text-xl font-semibold tracking-tight hover:text-primary transition-colors"
      >
        topolog
      </Link>

      <div className="flex items-center gap-4">
        <div className="flex items-center gap-1 rounded-md border border-border bg-card p-1">
          <button
            type="button"
            onClick={() => setMode("demo")}
            className={`rounded px-2.5 py-1 font-mono text-xs transition-colors ${
              mode === "demo"
                ? "bg-primary/10 text-primary"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Demo
          </button>
          <button
            type="button"
            disabled={!liveAvailable}
            onClick={() => liveAvailable && setMode("live")}
            className={`rounded px-2.5 py-1 font-mono text-xs transition-colors ${
              mode === "live"
                ? "bg-primary/10 text-primary"
                : "text-muted-foreground hover:text-foreground"
            } ${!liveAvailable ? "cursor-not-allowed opacity-50" : ""}`}
            title={liveAvailable ? "Use the wired backend API" : "Live mode is not configured"}
          >
            Live
          </button>
        </div>

        <nav className="flex items-center gap-1">
        {navItems.map((item) => {
          const isActive =
            item.href === "/"
              ? pathname === "/" && !isJobOrScene
              : pathname.startsWith(item.href)

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`rounded-md px-3 py-1.5 font-mono text-sm transition-colors ${
                isActive
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {item.label}
            </Link>
          )
        })}
        </nav>
      </div>
    </header>
  )
}
