import { Clock3 } from 'lucide-react'

export interface NotBuiltYetProps {
  /** What is missing, and WHY, in one sentence about the writer's post. */
  children: React.ReactNode
}

/**
 * Something this screen would offer if it could, said plainly where the control
 * would be.
 *
 * ── WHY A DIV AND NEVER A DISABLED BUTTON ────────────────────────────────────
 * A `<button disabled>` is still announced as a button by a screen reader, so it
 * reads as a control that exists and refuses — which is a promise this product
 * cannot keep and cannot explain. This is not interactive at all, in the markup
 * or in the accessibility tree; it is a sentence.
 *
 * ── AND WHY IT APPEARS AT ALL ────────────────────────────────────────────────
 * Leaving it out entirely reads as never planned, which is its own kind of
 * dishonesty on a screen whose whole argument is per-channel formats. Saying it
 * is not built, and saying which thing is in the way, is the honest middle.
 */
export function NotBuiltYet({ children }: NotBuiltYetProps) {
  return (
    /* `bg-s2` with a ring, never `bg-s1`. `--s1` IS `--canvas`, so on light it
       is the same #ffffff as the page and the card behind it, and this note has
       been an unbounded paragraph rather than a block ever since. skeleton.tsx
       carries the same lesson in its own comment ("learned the hard way in run
       18") and this file did not get it. The ring is what docs/26 §2 asks for
       in dark, where even the corrected fill step is only 1.04:1. */
    <p className="surface-ring flex items-start gap-2 rounded-sm bg-s2 px-3 py-2 text-[12.5px] text-muted">
      <Clock3 size={13} className="mt-icon-nudge shrink-0" aria-hidden />
      <span>{children}</span>
    </p>
  )
}
