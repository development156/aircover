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
        'min-h-[74px] w-full resize-y rounded-sm border-none bg-surface px-[11px] py-2 text-[13px] text-ink transition-micro placeholder:text-muted',
        'focus:shadow-[inset_0_0_0_1px_var(--brand),0_0_0_3px_var(--t50)] focus:outline-none',
        'disabled:opacity-50',
        error ? 'shadow-[inset_0_0_0_1.5px_var(--danger)]' : 'shadow-[inset_0_0_0_1px_var(--line)]',
        className,
      )}
      {...props}
    />
  )
})
