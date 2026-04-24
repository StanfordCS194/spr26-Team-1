import Link from "next/link"

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background px-6">
      <p className="font-mono text-6xl font-bold text-muted-foreground">404</p>
      <p className="font-mono text-lg text-foreground">Page not found</p>
      <Link
        href="/"
        className="mt-4 rounded-md bg-primary px-4 py-2 font-mono text-sm text-primary-foreground hover:bg-primary/90 transition-colors"
      >
        Go home
      </Link>
    </div>
  )
}
