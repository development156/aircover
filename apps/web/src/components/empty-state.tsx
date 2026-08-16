import type { LucideIcon } from 'lucide-react'

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
