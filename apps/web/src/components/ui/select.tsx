import * as React from 'react'
import { ChevronDown } from 'lucide-react'

import { cn } from '@/lib/utils'

/**
 * A NATIVE `<select>`, styled.
 *
 * ── WHY NOT A LISTBOX ────────────────────────────────────────────────────────
 * A custom listbox has to reimplement keyboard navigation, typeahead, the
 * mobile wheel picker, and the way a native select opens above the fold when it
 * would otherwise overflow — and it gets one of those wrong in every codebase
 * that tries. Sahoda's selects choose between four channels and a handful of
 * plans; none of them needs a search field or a custom row. The native control
 * is better at this job than anything worth building here.
 *
 * The chevron is decorative and `pointer-events-none`, so clicking it still
 * opens the select rather than swallowing the event.
 */
export function Select({
  className,
  /**
   * The WRAPPER's classes. The 280px cap below is right for a short enumeration
   * (a state, a country) and wrong for a long sentence: on /settings/plan the
   * tax-kind option "A business or person in India without a GSTIN" was cut
   * mid-word by it. Callers that hold long options pass `max-w-none`.
   *
   * It is a separate prop because `className` lands on the `select` itself, and
   * the constraint being overridden is on the span around it.
   */
  wrapperClassName,
  children,
  ...props
}: React.ComponentPropsWithoutRef<'select'> & { wrapperClassName?: string }) {
  return (
    <span
      className={cn('relative inline-flex w-full max-w-[280px] items-center', wrapperClassName)}
    >
      <select
        className={cn(
          'h-input w-full appearance-none rounded-sm border border-line bg-surface pr-8 pl-3 text-[13px]',
          'transition-micro hover:border-line-firm',
          // The touch floor. A select is the control people most often miss on
          // a phone, because its hit area is exactly its box.
          'max-narrow:min-h-[44px]',
          'disabled:cursor-not-allowed disabled:bg-s2 disabled:text-muted',
          className,
        )}
        {...props}
      >
        {children}
      </select>
      <ChevronDown
        aria-hidden
        size={15}
        strokeWidth={2}
        className="pointer-events-none absolute right-2.5 text-muted"
      />
    </span>
  )
}
