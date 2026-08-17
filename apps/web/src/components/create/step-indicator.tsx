import { Check } from 'lucide-react'

/**
 * The five-step rail (reference `.steps` / `.step__n` / `.step__l` / `.step__line`).
 *
 * The reference renders this inside a modal at ~640px. Here it sits at full page
 * width, so the connecting line is allowed to stretch rather than being fixed —
 * that is the one thing that has to change when a modal becomes a page, and it
 * is why the line is a flex-1 rule instead of a fixed-width span.
 *
 * ON A PHONE the labels drop and the numbers stay. Five labels at 390px either
 * wrap to two lines each or truncate to nonsense ("Cha…", "For…"), and the
 * numbered dots plus the heading above already say where you are. The label
 * survives for screen readers via `sr-only`, so the step names are never lost —
 * only their pixels.
 */
export function StepIndicator({
  steps,
  current,
}: {
  steps: readonly string[]
  /** Zero-based index of the active step. */
  current: number
}) {
  return (
    <ol
      aria-label="Progress"
      className="flex items-center gap-2 max-narrow:gap-1.5"
      data-guide="create.steps"
    >
      {steps.map((label, i) => {
        const done = i < current
        const on = i === current
        return (
          <li
            key={label}
            className="flex flex-1 items-center gap-2 last:flex-none max-narrow:gap-1"
          >
            <span
              // aria-current marks the step, not the list item, so a screen
              // reader announces position without reading the whole rail.
              aria-current={on ? 'step' : undefined}
              className={[
                'grid size-[22px] flex-none place-items-center rounded-full text-[11px] font-bold transition-micro',
                done
                  ? 'bg-brand text-primary-foreground'
                  : on
                    ? 'bg-brand text-primary-foreground'
                    : 'bg-s2 text-muted',
              ].join(' ')}
            >
              {done ? <Check size={12} strokeWidth={3} aria-hidden /> : i + 1}
            </span>
            <span
              className={[
                'text-[12.5px] whitespace-nowrap max-narrow:sr-only',
                on ? 'font-semibold text-ink' : 'text-muted',
              ].join(' ')}
            >
              {label}
            </span>
            {i < steps.length - 1 ? (
              <span
                aria-hidden
                className={`h-px flex-1 ${done ? 'bg-brand' : 'bg-line-soft'} max-narrow:min-w-[10px]`}
              />
            ) : null}
          </li>
        )
      })}
    </ol>
  )
}
