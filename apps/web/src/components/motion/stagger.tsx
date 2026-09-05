import { cn } from '@/lib/utils'

/**
 * How content arrives. One rhythm for the product (docs/26 §8.1).
 *
 * ── WHY A COMPONENT AND NOT A CLASS ──────────────────────────────────────────
 * The class alone would still need every call site to write `--i` by hand, and
 * a hand-written delay is the same failure mode as a hand-written font
 * shorthand: eleven screens, eleven rhythms. These set it for you.
 *
 * ── WHY THERE IS NO `duration` OR `delay` PROP ───────────────────────────────
 * Deliberately. The moment a caller can pass 320ms, the system has as many
 * timings as it has callers. If a screen genuinely needs a rhythm these cannot
 * express, that is a gap in docs/26 §8 — add it there first.
 *
 * ── THE CAP IS IN CSS ────────────────────────────────────────────────────────
 * `--i` is passed raw and clamped by `min(var(--i), var(--stagger-cap))` in
 * tokens.css, so a 40-row table does not take 1.6s to finish arriving and the
 * ceiling is written in exactly one place.
 *
 * ── REDUCED MOTION ───────────────────────────────────────────────────────────
 * Handled entirely in tokens.css, which now zeroes `animation-delay` as well as
 * duration — without that, `fill: both` left staggered rows invisible for the
 * length of their delay and then snapped them in.
 *
 * These are server components. Nothing here needs the client.
 */

/** One element that arrives in sequence. `i` is its position in the group. */
export function StaggerItem({
  i,
  className,
  children,
}: {
  i: number
  className?: string
  children: React.ReactNode
}) {
  return (
    <div className={cn('enter-step', className)} style={{ '--i': i } as React.CSSProperties}>
      {children}
    </div>
  )
}

/**
 * ── `Stagger` WAS HERE, AND ITS ONE REMAINING CALLER WENT WITH IT ────────────
 * Removed 2026-09-04, in the same change that deleted `channel-browser.tsx` —
 * its last four call sites. It wrapped each child in a `StaggerItem` keyed by
 * INDEX, and `connection-marketplace.tsx` records why that is the wrong shape
 * for anything filterable: an index key carries a failed control's state onto a
 * different row when the list changes underneath it. Every list left in the app
 * either never reorders or keys its own items, so each uses `StaggerItem`
 * directly.
 *
 * The ratchet in `scripts/lib/unmounted-components.test.mjs` is what noticed:
 * deleting the browser orphaned this, and it refused the commit by name rather
 * than letting a dead export ride along.
 */

/** A single element that arrives, with no sequence. The plain entrance. */
export function Enter({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn('enter', className)}>{children}</div>
}
