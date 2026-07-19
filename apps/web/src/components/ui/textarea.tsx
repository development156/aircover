import * as React from 'react'

import { cn } from '@/lib/utils'

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  /** Error state (docs/08 §6): danger border, 13px message rendered by the caller. */
  error?: boolean
}

// shadcn/ui Textarea, restyled per Design System §6 (same recipe as Input).
export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { className, error, ...props },
  ref,
) {
  return (
    <textarea
      ref={ref}
      aria-invalid={error || undefined}
      className={cn(
        'min-h-[74px] w-full resize-y rounded-input border bg-s1 px-3 py-2.5 text-[14px] text-ink transition-micro placeholder:text-faint',
        'focus:bg-bg focus:outline-none',
        'disabled:opacity-50',
        error ? 'border-danger' : 'border-line',
        className,
      )}
      {...props}
    />
  )
})
