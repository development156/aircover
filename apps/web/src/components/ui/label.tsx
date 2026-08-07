import * as React from 'react'

import { cn } from '@/lib/utils'

// shadcn/ui Label, restyled per Design System §3 (h3/label token: 14/20, 600).
export const Label = React.forwardRef<
  HTMLLabelElement,
  React.LabelHTMLAttributes<HTMLLabelElement>
>(function Label({ className, ...props }, ref) {
  return (
    <label ref={ref} className={cn('text-[12.5px] font-semibold text-ink', className)} {...props} />
  )
})
