import * as React from 'react'

import { cn } from '@/lib/utils'

// shadcn/ui Label, restyled to the kit's `.sl-label`: 12px at weight 550,
// --ink-mute. The half-step weight is the point — a label separates from its
// value by 550-against-400 rather than by jumping to bold, which is why the
// variable font axis is load-bearing (see layout.tsx).
export const Label = React.forwardRef<
  HTMLLabelElement,
  React.LabelHTMLAttributes<HTMLLabelElement>
>(function Label({ className, ...props }, ref) {
  return (
    <label ref={ref} className={cn('text-[12px] font-[550] text-muted', className)} {...props} />
  )
})
