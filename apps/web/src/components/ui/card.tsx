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
        'mb-2 flex items-center gap-2 font-mono text-[10.5px] font-semibold tracking-[0.14em] text-muted uppercase',
        className,
      )}
      {...props}
    />
  )
}
