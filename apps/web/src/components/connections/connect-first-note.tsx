import Link from 'next/link'
import { Plug } from 'lucide-react'

/**
 * The first thing a new shop owner needs to be told, on the screen where they
 * start.
 *
 * ── WHY IT LIVES HERE AND NOT ON /connections ────────────────────────────────
 * Someone with nothing connected does not visit the Connections page — they open
 * Posts and start writing, because writing is what they came to do. They then
 * compose a post, attach a photo, set a time, press Publish, and only at that
 * last moment learn that no account was ever attached. Everything up to the
 * failure was offered as though it would work.
 *
 * Renders ONLY when the workspace has no live connection at all. One is enough to
 * make the journey work end to end, and a permanent banner nagging someone who
 * has connected Instagram but not LinkedIn would be noise they learn to ignore —
 * which is how the notice that actually matters stops being read.
 */
export function ConnectFirstNote({ connectedCount }: { connectedCount: number }) {
  if (connectedCount > 0) return null

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-tint-300 bg-tint-50 p-4 dark:bg-s2">
      <div className="min-w-0">
        <p className="text-[14px] font-bold">Connect a channel to post for real</p>
        <p className="text-[13px] text-muted">
          You can write and plan without one. Connecting is what lets a post actually go out.
        </p>
      </div>
      <Link
        href="/connections"
        data-guide="nudge.connect"
        className="inline-flex shrink-0 items-center gap-1.5 rounded-pill bg-accent px-3 py-1.5 text-[13px] font-semibold text-white transition-micro hover:brightness-95 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        <Plug size={14} aria-hidden />
        Connect a channel
      </Link>
    </div>
  )
}
