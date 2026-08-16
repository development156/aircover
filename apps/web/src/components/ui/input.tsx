import * as React from 'react'

import { cn } from '@/lib/utils'

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  /** Error state (docs/08 §6): danger border, 13px message rendered by the caller. */
  error?: boolean
}

// shadcn/ui Input, restyled to the kit's `.sl-input`: 38px tall, 11px inset,
// 13px type, 6px radius, --surface ground, and an INSET RING rather than a
// border so focus can thicken the edge without reflowing the row.
//
// Focus paints its own ring here (orange hairline + a 3px wash) instead of
// relying on the global :focus-visible outline. That is deliberate and it is
// the one sanctioned exception: an outline sits OUTSIDE the box and would
// overlap the neighbouring field in a 6px-gap stack, whereas the inset ring
// stays within the control's own bounds.
export const Input = React.forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, error, ...props },
  ref,
) {
  return (
    <input
      ref={ref}
      aria-invalid={error || undefined}
      className={cn(
        'h-input w-full rounded-sm border-none bg-surface px-[11px] text-[13px] text-ink transition-micro placeholder:text-muted',
        'focus:shadow-[inset_0_0_0_1px_var(--brand),0_0_0_3px_var(--t50)] focus:outline-none',
        'disabled:opacity-50',
        // Error is a RING WEIGHT change, not a hue change — --danger is the
        // brand orange, so a 1.5px ring is what actually distinguishes it.
        error ? 'shadow-[inset_0_0_0_1.5px_var(--danger)]' : 'shadow-[inset_0_0_0_1px_var(--line)]',
        className,
      )}
      {...props}
    />
  )
})
