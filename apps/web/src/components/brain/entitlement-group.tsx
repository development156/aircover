import type { ReactNode } from 'react'

import type { BrainFieldMetaKind } from '@/lib/brand/fields'
import { ENTITLEMENT } from '@/lib/brand/resolution-queue'
import { cn } from '@/lib/utils'

/**
 * ONE ENTITLEMENT SENTENCE PER GROUP, not one per row.
 *
 * The sentence is a pure lookup on `field.metaKind` — two possible values for
 * fifteen rows — so rendering it per row printed the same 147 characters eleven
 * times. It says nothing about the individual field, so it belongs over the run,
 * not inside it. `resolutionQueue` already sorts by `KIND_RANK`, so the two runs
 * are contiguous and grouping reorders nothing.
 *
 * NO COUNT HERE, deliberately. The section header already prints
 * `{open.length} of {tally.registered}` and the page prints the asked/proposed
 * split — and those two numbers update on DIFFERENT cadences (`tally` is
 * computed from `queue`, and the page's legend is computed on the server), so a
 * third counter fed from `open` would visibly disagree with the legend for the
 * length of every revalidation round trip.
 */
export function EntitlementGroup({
  kind,
  divided,
  children,
}: {
  kind: BrainFieldMetaKind
  /** A rule above the header. False for the first group, whose separator is the bar above it. */
  divided: boolean
  children: ReactNode
}) {
  const entitlement = ENTITLEMENT[kind]
  const headingId = `console-group-${kind}`
  return (
    <section aria-labelledby={headingId}>
      <div
        className={cn(
          'border-b border-line-soft bg-surface-2 px-4 py-3',
          divided && 'border-t border-line-soft',
        )}
      >
        <h3 id={headingId} className="type-h3 text-ink">
          {entitlement.heading}
        </h3>
        <p id={`${headingId}-why`} className="type-sm mt-1 text-muted">
          {entitlement.line}
        </p>
      </div>
      <ul aria-labelledby={headingId}>{children}</ul>
    </section>
  )
}
