import * as React from 'react'

import { cn } from '@/lib/utils'

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Interactive cards lift on hover (docs/08 §6). */
  interactive?: boolean
}

// shadcn/ui Card, restyled to the kit's `.sl-card`.
//
// A RESTING CARD HAS NO SHADOW. A shadow means "this floats above the page", so
// it is reserved for layers that genuinely do — which is what lets a dialog read
// as ABOVE rather than merely bigger. Depth here comes from a hairline inset
// ring instead, and that is also why the card reads flat and dense rather than
// puffy. Keeping BOTH a border and the ring is the single most common way this
// port goes wrong (RETHEME.md §9: "Cards look heavy"), so there is exactly one:
// the ring.
//
// Only `interactive` cards lift. Cards that are not clickable do not move,
// because a hover response is a promise that a click does something.
export const Card = React.forwardRef<HTMLDivElement, CardProps>(function Card(
  { className, interactive, ...props },
  ref,
) {
  return (
    <div
      ref={ref}
      className={cn(
        'surface-ring rounded-card bg-surface p-4',
        // The kit draws this hover ring with --text-3, whose equivalent here is
        // --ink-faint. Using --line-firm instead: ink-faint is ratcheted to a
        // shrinking allowlist (ink-faint-exceptions.ts — adding an entry fails
        // the gate), and a ring is a LINE, so a line token is the honest name
        // for it regardless. Same rendered weight, no debt added.
        interactive &&
          'transition-panel hover:-translate-y-px hover:shadow-[inset_0_0_0_1px_var(--line-firm),var(--sh-card)]',
        className,
      )}
      {...props}
    />
  )
})

export function CardLabel({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p
      className={cn(
        // `type-eyebrow` IS the v3 eyebrow: --t-eyebrow (600 11px/14px mono) plus
        // --t-eyebrow-ls tracking and uppercase. The previous hand-rolled copy
        // duplicated all four and sat at 10.5px, off the type scale entirely.
        'type-eyebrow mb-2 flex items-center gap-2 text-muted',
        className,
      )}
      {...props}
    />
  )
}
