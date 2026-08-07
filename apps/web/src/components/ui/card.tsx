import * as React from 'react'

import { cn } from '@/lib/utils'

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Interactive cards lift on hover (docs/08 §6). */
  interactive?: boolean
}

// shadcn/ui Card, restyled per Design System §6: --bg, --line, --r-card,
// --sh-card, pad 16–24; interactive variant hovers translateY(-2px).
export const Card = React.forwardRef<HTMLDivElement, CardProps>(function Card(
  { className, interactive, ...props },
  ref,
) {
  return (
    <div
      ref={ref}
      className={cn(
        'rounded-card border border-line bg-bg p-5 shadow-card',
        interactive && 'transition-panel hover:-translate-y-0.5',
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
