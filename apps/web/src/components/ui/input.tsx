import * as React from 'react'

import { cn } from '@/lib/utils'

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  /** Error state (docs/08 §6): danger border, 13px message rendered by the caller. */
  error?: boolean
}

// shadcn/ui Input, restyled per Design System §6: --s1 bg, --line border,
// --r-input radius, focus -> --bg bg (ring comes from the global :focus-visible
// rule), error -> --danger border, disabled -> 50% opacity.
export const Input = React.forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, error, ...props },
  ref,
) {
  return (
    <input
      ref={ref}
      aria-invalid={error || undefined}
      className={cn(
        'w-full rounded-input border bg-s1 px-3 py-2.5 text-[14px] text-ink transition-micro placeholder:text-muted',
        'focus:bg-bg focus:outline-none',
        'disabled:opacity-50',
        error ? 'border-danger' : 'border-line',
        className,
      )}
      {...props}
    />
  )
})
