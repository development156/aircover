import { Lock } from 'lucide-react'

import type { ComposerStep } from '@/lib/posts/composer-steps'
import { cn } from '@/lib/utils'

/**
 * One numbered step on the composer, open or refused.
 *
 * ── REFUSED, NOT REMOVED ─────────────────────────────────────────────────────
 * A locked step stays on the screen at full size with its heading readable. It
 * is the reader's map of what this page is going to ask of them, and hiding the
 * next two thirds of that map to save a moment's clutter costs far more than it
 * saves — "where did the channels go" is a question the product cannot answer
 * once it has stopped rendering the answer.
 *
 * ── THE REFUSAL IS MECHANICAL, NOT COSMETIC ──────────────────────────────────
 * Three things together, because any one of them alone leaks:
 *
 *   `inert`          the platform's own switch: no clicks, no focus, no typing,
 *                    and the subtree leaves the accessibility tree. One
 *                    attribute does what a page of guards used to.
 *   `aria-hidden`    for the runtimes whose `inert` support is newer than the
 *                    browsers this ships to.
 *   opacity + a line the reason, so the state is readable rather than deduced.
 *
 * Pointer-events alone would have been the tempting version and it is the wrong
 * one: a keyboard user tabs straight past the dimming into a control that looks
 * unavailable and is not.
 */

export interface StepSectionProps {
  /** 1, 2, 3 — shown, because the request was for a sequence people can see. */
  index: number
  title: string
  step: ComposerStep
  children: React.ReactNode
}

export function StepSection({ index, title, step, children }: StepSectionProps) {
  const locked = step.access === 'locked'

  return (
    <section
      data-step={index}
      data-step-locked={locked ? 'true' : 'false'}
      aria-labelledby={`step-${index}`}
      className="space-y-3"
    >
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <h2 id={`step-${index}`} className="type-h3 flex items-center gap-2">
          <span
            aria-hidden
            className={cn(
              'type-chip grid size-5 shrink-0 place-items-center rounded-full tabular-nums',
              locked
                ? 'bg-s2 text-muted'
                : 'bg-ink text-white dark:bg-white dark:text-[var(--canvas)]',
            )}
          >
            {index}
          </span>
          {title}
        </h2>
        {locked ? (
          <span className="type-meta inline-flex items-center gap-1.5 text-muted">
            <Lock size={12} strokeWidth={1.8} aria-hidden />
            {step.reason}
          </span>
        ) : null}
      </div>

      {/* `inert` is what actually refuses the step. React 19 renders the boolean
          attribute directly, so there is no ref dance and nothing to keep in
          sync on re-render. */}
      <div
        inert={locked || undefined}
        aria-hidden={locked || undefined}
        className={cn(locked && 'opacity-45')}
      >
        {children}
      </div>
    </section>
  )
}
