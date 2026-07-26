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
    <section className="flex flex-col items-center gap-3 rounded-card border border-line bg-bg px-6 py-12 text-center shadow-card">
      {/* dark: tint-50 stays warm-light while --acc flips to Orange300 → s2 surface */}
      <span className="grid size-12 place-items-center rounded-pill bg-tint-50 text-accent dark:bg-s2">
        <Icon size={22} strokeWidth={1.7} aria-hidden />
      </span>
      <h2 className="text-[18px] leading-[26px] font-bold">{title}</h2>
      <p className="max-w-[42ch] text-muted">{body}</p>
      {action ? <div className="mt-2">{action}</div> : null}
      {tip ? <p className="mt-1 text-[13px] text-muted">Sahoda: {tip}</p> : null}
    </section>
  )
}
