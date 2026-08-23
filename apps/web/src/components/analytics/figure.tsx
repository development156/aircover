import { coverageNote, type Coverage, type CoveredTotal } from '@/lib/analytics/compare'
import { metricValue } from '@/lib/analytics/copy'

/**
 * The two primitives every number on this page goes through.
 *
 * Both exist to make the honest rendering the EASY one. `metricValue` already turns
 * an unreported metric into an em dash, but a page that aggregates has two further
 * ways to print a claim it cannot support — a missing total rendered as "0", and a
 * total rendered without the coverage it was computed from. Routing every figure
 * through these means neither is reachable by writing ordinary-looking JSX.
 */

/**
 * A number, or the dash that says there isn't one.
 *
 * `tabular-nums` is not decoration here: these sit in columns that get read down,
 * and proportional digits make a 4-digit figure look shorter than a 3-digit one.
 */
export function Figure({ value, className = '' }: { value: number | null; className?: string }) {
  return (
    <span className={`tabular-nums ${value === null ? 'text-muted' : 'text-ink'} ${className}`}>
      {metricValue(value)}
    </span>
  )
}

/**
 * A total with its denominator attached, or nothing at all.
 *
 * `total === null` renders the dash rather than a zero — see `totalFor`, which
 * returns null precisely so this cannot print a "0" that means "we asked nobody".
 *
 * The coverage is rendered as a `title` and a visually-quiet suffix rather than
 * hidden in a tooltip alone: docs/08 forbids putting load-bearing information
 * somewhere a touch device cannot reach it, and "which 3 of 8" is load-bearing.
 */
export function TotalFigure({
  total,
  noun = 'channels',
}: {
  total: CoveredTotal | null
  noun?: string
}) {
  if (total === null) {
    return (
      <span className="tabular-nums text-muted" title="Nothing reported for this metric yet.">
        —
      </span>
    )
  }

  const complete = total.coverage.counted === total.coverage.of

  return (
    <span className="inline-flex items-baseline gap-1.5" title={coverageNote(total.coverage, noun)}>
      <Figure value={total.value} />
      {/* Only stated when it is NOT everything. A "5 of 5" beside every figure is
          noise that trains the reader to skip the one that says "2 of 5". */}
      {complete ? null : (
        <span className="type-meta tabular-nums text-muted">
          {total.coverage.counted}/{total.coverage.of}
        </span>
      )}
    </span>
  )
}

/**
 * The sentence a set of figures may not appear without.
 *
 * Rendered even when coverage is complete — "All 6 channels reported" is the
 * statement that makes the partial version meaningful. A note that only appears
 * when something is wrong is a note readers learn to stop looking for.
 */
export function CoverageLine({
  coverage,
  noun = 'channels',
  className = '',
}: {
  coverage: Coverage
  noun?: string
  className?: string
}) {
  if (coverage.of === 0) return null
  return <p className={`type-meta text-muted ${className}`}>{coverageNote(coverage, noun)}</p>
}
