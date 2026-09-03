'use client'

import * as React from 'react'

import { cn } from '@/lib/utils'

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  /** Error state (docs/08 §6): danger border, 13px message rendered by the caller. */
  error?: boolean
  /**
   * Grow to fit what is typed, up to `maxRows`.
   *
   * ── OPT IN, NOT THE DEFAULT ───────────────────────────────────────────────
   * Every existing caller sized its box on purpose, and a box that silently
   * started resizing would reflow forms nobody asked to change. It is on where
   * a person writes something of unknown length, like a prompt, and off where
   * the field has a shape the layout depends on.
   */
  autoGrow?: boolean
  /** How tall it may get before it scrolls instead. Ignored without `autoGrow`. */
  maxRows?: number
}

// shadcn/ui Textarea, restyled per Design System §6 (same recipe as Input).
export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { className, error, autoGrow, maxRows = 12, ...props },
  ref,
) {
  const own = React.useRef<HTMLTextAreaElement>(null)
  React.useImperativeHandle(ref, () => own.current as HTMLTextAreaElement)

  /**
   * ── HEIGHT RESET FIRST, THEN MEASURED ─────────────────────────────────────
   * `scrollHeight` on an element already tall enough reports its CURRENT height,
   * so measuring without resetting makes a box that only ever grows: delete a
   * paragraph and the empty space stays.
   */
  const fit = React.useCallback(() => {
    const el = own.current
    if (el === null || autoGrow !== true) return
    el.style.height = 'auto'
    const line = Number.parseFloat(getComputedStyle(el).lineHeight) || 18
    const cap = line * maxRows
    el.style.height = `${Math.min(el.scrollHeight, cap)}px`
    el.style.overflowY = el.scrollHeight > cap ? 'auto' : 'hidden'
  }, [autoGrow, maxRows])

  // On value as well as on input, so a value set from elsewhere (a starter
  // prompt, a reused one) resizes the box too rather than only typing.
  React.useEffect(fit, [fit, props.value])

  return (
    <textarea
      ref={own}
      onInput={(event) => {
        fit()
        props.onInput?.(event)
      }}
      aria-invalid={error || undefined}
      className={cn(
        'min-h-[74px] w-full rounded-sm border-none bg-surface px-[11px] py-2 text-[13px] text-ink transition-micro placeholder:text-muted',
        // A box that sizes itself must not also carry a drag handle: the two
        // fight, and the handle wins until the next keystroke undoes it.
        autoGrow === true ? 'resize-none' : 'resize-y',
        'focus:shadow-[inset_0_0_0_1px_var(--brand),0_0_0_3px_var(--t50)] focus:outline-none',
        'disabled:opacity-50',
        error ? 'shadow-[inset_0_0_0_1.5px_var(--danger)]' : 'shadow-[inset_0_0_0_1px_var(--line)]',
        className,
      )}
      {...props}
    />
  )
})
