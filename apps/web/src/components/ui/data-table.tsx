import { cn } from '@/lib/utils'

/**
 * A real table, for anything a person scans down a column.
 *
 * ── WHY THIS EXISTS ──────────────────────────────────────────────────────────
 * `/posts` rendered eight records as eight stacked cards of identical weight —
 * no column to scan, no sort, and ~90px of footer per row spent on a Delete
 * button. `/wallet` rendered the SAME dataset that `/home` showed as a card
 * list, as a table, with full header chrome for one row. Two vocabularies for
 * one job is how a product stops looking designed.
 *
 * The rule: if a reader compares values ACROSS records, it is a table. If they
 * read one record at a time, it is a list.
 *
 * ── THE EMPTY STATE IS PART OF THE TABLE ─────────────────────────────────────
 * It renders inside the table, not instead of it, so the columns stay visible
 * and the reader can see WHAT would be here. A table that disappears when empty
 * teaches nothing.
 */
export interface Column {
  key: string
  header: string
  /** Right-aligned and tabular. Anything countable the user is accountable for. */
  numeric?: boolean
}

export function DataTable({
  caption,
  columns,
  rows,
  empty,
  className,
}: {
  /** Always present. Visually hidden, but a table with no caption is unnavigable. */
  caption: string
  columns: readonly Column[]
  rows: ReadonlyArray<Record<string, React.ReactNode>>
  empty?: string
  className?: string
}) {
  return (
    <div className={cn('overflow-x-auto rounded-card border border-line-soft', className)}>
      <table className="w-full border-collapse text-[13px]">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr>
            {columns.map((c) => (
              <th
                key={c.key}
                scope="col"
                className={cn(
                  'type-eyebrow border-b border-line-soft px-3 py-2 text-muted',
                  c.numeric ? 'text-right' : 'text-left',
                )}
              >
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="px-3 py-8 text-center text-muted">
                {empty ?? 'Nothing here yet.'}
              </td>
            </tr>
          ) : (
            rows.map((row, i) => (
              <tr key={i} className="border-b border-line-soft last:border-0 hover:bg-s2">
                {columns.map((c) => (
                  <td
                    key={c.key}
                    className={cn('px-3 py-2.5', c.numeric && 'num text-right tabular-nums')}
                  >
                    {row[c.key]}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  )
}
