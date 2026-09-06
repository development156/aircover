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
  error,
  children,
  ...props
}: React.ComponentPropsWithoutRef<'select'> & {
  wrapperClassName?: string
  /** Error state: the same ring-weight change `Input` makes, for the same reason. */
  error?: boolean
}) {
  return (
    <span
      className={cn('relative inline-flex w-full max-w-[280px] items-center', wrapperClassName)}
    >
      {/* ── THE SAME EDGE AND THE SAME FOCUS AS `Input`, WHICH IT WAS NOT ──────
          Until 2026-08-31 this shipped `border border-line` and left focus to the
          global outline, beside an Input that ships an INSET RING and paints its
          own two-part focus ring. A form holding one of each showed two edge
          weights at rest and two focus treatments while tabbing through it. Same
          recipe now, and `error` for parity, so a field and a select in the same
          row cannot disagree about what "invalid" looks like. */}
      <select
        aria-invalid={error || undefined}
        className={cn(
          'h-input w-full appearance-none rounded-sm border-none bg-surface pr-8 pl-3 type-sm text-ink',
          'transition-micro hover:shadow-[inset_0_0_0_1px_var(--line-firm)]',
          'focus:shadow-[inset_0_0_0_1px_var(--brand),0_0_0_3px_var(--t50)] focus:outline-none',
          // The touch floor. A select is the control people most often miss on
          // a phone, because its hit area is exactly its box.
          'max-narrow:min-h-[44px]',
          'disabled:cursor-not-allowed disabled:bg-s2 disabled:text-muted',
          error
            ? 'shadow-[inset_0_0_0_1.5px_var(--danger)]'
            : 'shadow-[inset_0_0_0_1px_var(--line)]',
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
