/**
 * What a chart says when it has nothing to draw.
 *
 * The rule both Home charts obey: never draw a flat line that reads as "no
 * activity" when it means "no data". An axis with a line pinned to zero is a
 * confident claim of zero, and a failed read has no business making it.
 *
 * So the two cases are kept apart in words as well as in state:
 *   empty      — read fine, genuinely nothing there. The normal state of a new
 *                workspace, and not a failure.
 *   unreadable — we could not look. Says so, and never borrows the empty copy.
 */
export function ChartEmpty({ status, empty }: { status: 'empty' | 'unreadable'; empty: string }) {
  return (
    <p
      data-testid="chart-empty"
      className="flex min-h-[96px] items-center justify-center px-4 text-center type-sm text-muted"
    >
      {status === 'unreadable' ? "Couldn't read this right now. Try again in a moment." : empty}
    </p>
  )
}

/**
 * The coverage note for a capped read.
 *
 * Names the DATE coverage starts at, never a row count: truncation is
 * oldest-first, so what a user needs to know is which day the picture begins —
 * "from 12 Jul" is something they can reason about, "500 rows" is not.
 */
export function CoverageNote({ coveredFrom }: { coveredFrom: string | null }) {
  if (coveredFrom === null) return null

  const date = new Date(`${coveredFrom}T00:00:00.000Z`)
  if (Number.isNaN(date.getTime())) return null

  const label = new Intl.DateTimeFormat('en-IN', {
    timeZone: 'UTC',
    day: 'numeric',
    month: 'short',
  }).format(date)

  return (
    <p className="mt-2 type-meta text-muted">
      Showing from {label} — older days are outside this view.
    </p>
  )
}
