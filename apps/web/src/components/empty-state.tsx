import type { LucideIcon } from 'lucide-react'

import { cn } from '@/lib/utils'

// Empty state per docs/06 §4.10: icon in --t50 circle + one sentence + ONE
// primary action + optional Sahoda tip. `action` is optional by design — a
// page with no real destination renders none (no fake affordances).
export function EmptyState({
  icon: Icon,
  title,
  body,
  action,
  tip,
}: {
  icon: LucideIcon
  title: string
  body: string
  action?: React.ReactNode
  tip?: string
}) {
  return (
    // The kit's `.sl-state`: an inset hairline ring and NO shadow — a resting
    // surface does not float. Padding is 40/20 (--s8/--s5).
    <section className="surface-ring flex flex-col items-center gap-2 rounded-card bg-surface px-5 py-10 text-center">
      {/* `.sl-state__ic` is a 44px ROUNDED SQUARE, not a circle — a circle reads
          as an avatar, and this is a marker. Accent variant: orange glyph on a
          6% wash with a 24% ring. The wash is an alpha, so it composites on
          dark without needing a second value. */}
      <span className="mb-2 grid size-11 place-items-center rounded-md bg-brand-wash text-accent shadow-[inset_0_0_0_1px_var(--brand-lift)]">
        <Icon size={21} strokeWidth={1.7} aria-hidden />
      </span>
      <h2 className="text-[14px] font-semibold">{title}</h2>
      <p className="max-w-[340px] text-[13px] text-muted">{body}</p>
      {/* `.sl-state__a` — "is not optional" (RETHEME.md §4.5): an empty state
          answers what this is AND what to do next. It stays conditional here
          only because some screens genuinely have no destination to offer, and
          a button that goes nowhere is worse than none. */}
      {action ? <div className="mt-3">{action}</div> : null}
      {tip ? <p className="mt-1 text-[12px] text-muted">Sahoda: {tip}</p> : null}
    </section>
  )
}

/**
 * The SECTION-level empty state — what one card says when it has nothing,
 * inside a page that has plenty (docs/26 §4.1).
 *
 * ── WHY THIS IS NOT `EmptyState` ─────────────────────────────────────────────
 * `EmptyState` is a PAGE answering "there is nothing here at all": a 44px
 * marker tile, a heading, a sentence and the one action that fixes it. Rendered
 * inside a card it inverts the page's hierarchy, because the loudest, most
 * saturated object on the screen ends up being the one carrying the least
 * information. MEASURED on /analytics: six empty treatments in six visual
 * languages on one screen, and the eye landed on the emptiest thing first.
 *
 * So this is the quiet one. No marker tile, no heading, no ring — it lives
 * inside a card that already has one, and `border + ring` together is the most
 * common way this system goes wrong (docs/26 §7).
 *
 * ── THE THREE LEVELS, SO NOBODY INVENTS A FOURTH ─────────────────────────────
 *   page  — the route has nothing            → `EmptyState`
 *   card  — one section has nothing          → `CardEmpty`  (this)
 *   slot  — one NUMBER is not there          → `Unmeasured` / `Unreadable`
 *
 * ── IT STATES THE CLAIM, NOT A MOOD ──────────────────────────────────────────
 * "We never asked" and "we asked and got nothing back" are different sentences
 * and `lib/inbox/emptiness.ts` exists to keep eight of them apart. `body` is the
 * claim. Keep it to one sentence — a card that apologises at length reads as a
 * product apologising for itself, which is what five variants of "nothing yet"
 * on one screen already did.
 */
export function CardEmpty({
  body,
  action,
  className,
}: {
  /** One sentence, stating precisely what is and is not known. */
  body: string
  /** At most one, and only when it actually leads somewhere that works. */
  action?: React.ReactNode
  className?: string
}) {
  return (
    <div
      data-testid="card-empty"
      // Vertically centred in the space the real content would have taken, so a
      // card does not visibly change height when its first row arrives.
      className={cn(
        'flex min-h-[96px] flex-col items-center justify-center gap-3 px-4 py-6 text-center',
        className,
      )}
    >
      <p className="type-sm max-w-[38ch] text-muted">{body}</p>
      {action ?? null}
    </div>
  )
}
