import { Lock } from 'lucide-react'

/**
 * The controls this bar is designed for and does not have.
 *
 * They render as spans. `design-lint.mjs` rule 3 refuses `<button disabled>`
 * beside a coming-soon label, and it is right: a disabled button is still
 * announced as an action. A name leaves this list the day it ships — "Tidy
 * my words" sat here after the refiner shipped, so the bar carried a lock
 * beside a control that was rendering, working and charging a credit a few
 * hundred pixels above it.
 */
const COMING_SOON = [
  { title: 'Leave out' },
  { title: 'Same again' },
  { title: 'Follow how closely' },
] as const

export function ComposerNotBuilt() {
  return (
    <div className="flex flex-wrap items-center gap-2" data-guide="studio-coming-soon">
      <span className="type-eyebrow text-muted">Not built yet</span>
      {COMING_SOON.map((one) => (
        <span
          key={one.title}
          className="surface-ring flex items-center gap-2 rounded-pill px-3 py-1 opacity-70"
        >
          <Lock className="size-[12px] text-muted" aria-hidden />
          <span className="type-sm text-muted">{one.title}</span>
        </span>
      ))}
      <span className="type-sm text-muted">
        Designed and not built. Nothing here changes what a press does today.
      </span>
    </div>
  )
}

/** How many controls are named as missing, for the bar's own "N more" chip — kept in step by importing this rather than a second literal. */
export const COMING_SOON_COUNT = COMING_SOON.length
