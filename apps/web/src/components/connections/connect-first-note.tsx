import Link from 'next/link'
import { Plug } from 'lucide-react'

import { buttonVariants } from '@/components/ui/button'

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
    // The kit's `.sl-banner`: a wash with a hairline ring, not a border — the
    // tints are alphas, so this composites on dark without a second value and
    // the `dark:bg-s2` override it used to need is gone.
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-card bg-brand-wash p-4 shadow-[inset_0_0_0_1px_var(--brand-lift)]">
      <div className="min-w-0">
        <p className="text-[14px] font-[650]">Connect a channel to post for real</p>
        <p className="text-[13px] text-muted">
          You can write and plan without one. Connecting is what lets a post actually go out.
        </p>
      </div>
      {/* Wears the Button's clothes rather than re-typing them — this one was a
          32px pill in `bg-accent` because it was hand-rolled. */}
      <Link
        href="/connections"
        data-guide="nudge.connect"
        className={buttonVariants({ variant: 'primary' })}
      >
        <Plug size={14} aria-hidden />
        Connect a channel
      </Link>
    </div>
  )
}
