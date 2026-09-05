import { ChevronDown } from 'lucide-react'

/**
 * ONE PILL SHAPE, EVERY TIME.
 *
 * The bar's second row is Match, Model, Approach, Size and Logo, and every one
 * of them is this same 32px shape: an optional leading icon, a bare value —
 * never "axis value" — and an optional trailing caret. The axis lives on the
 * accessible name instead, so a screen reader hears "Model, Everyday" even
 * though the label on screen only says "Everyday".
 */
export function ComposerPill({
  icon,
  label,
  axisLabel,
  onClick,
  expanded,
  controls,
  caret = false,
}: {
  icon?: React.ReactNode
  label: string
  axisLabel: string
  onClick: () => void
  expanded: boolean
  controls: string
  caret?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={expanded}
      aria-controls={controls}
      aria-label={axisLabel}
      className="surface-ring flex h-control items-center gap-1.5 rounded-pill bg-s2 px-3 type-sm font-[550] text-ink transition-micro hover:bg-surface-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
    >
      {icon}
      <span aria-hidden>{label}</span>
      {caret ? (
        <ChevronDown
          className={`size-[12px] shrink-0 text-muted transition-micro ${expanded ? 'rotate-180' : ''}`}
          aria-hidden
        />
      ) : null}
    </button>
  )
}
