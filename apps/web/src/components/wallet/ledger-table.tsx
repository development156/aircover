import type { LedgerEntry } from '@sahoda/shared'

import { describeEntry, formatUsdAmount, type Direction } from '@/lib/wallet/entry-copy'
import { cogsUsd } from '@/lib/wallet/parse-entries'
import { cn } from '@/lib/utils'

export interface LedgerTableProps {
  entries: readonly LedgerEntry[]
  /** Rows that did not match the contract. Surfaced, never hidden. */
  skipped: number
  /**
   * The row cap the read was made with. The query is windowed, so a full page is
   * a partial history — saying so is the difference between "this is your credit
   * activity" and "this is the newest slice of it".
   */
  limit: number
}

/**
 * Pinned zone as well as locale: the server and the reader can sit in different
 * zones, and a date that silently shifts by a day is a wrong number.
 */
const WHEN = new Intl.DateTimeFormat('en-IN', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'Asia/Kolkata',
})

function formatWhen(iso: string): string | null {
  const ms = Date.parse(iso)
  return Number.isFinite(ms) ? WHEN.format(ms) : null
}

/**
 * Credit rows read green; debits stay ink (a normal charge is not an alarm);
 * neutral rows — HOLD and RELEASE — are muted because they never moved the total.
 */
const AMOUNT_TONE: Record<Direction, string> = {
  credit: 'text-ok',
  debit: 'text-ink',
  neutral: 'text-muted',
}

const CELL = 'px-3 py-3 align-top'

export function LedgerTable({ entries, skipped, limit }: LedgerTableProps) {
  // A full page means the window cut the history off. There is no pagination to
  // offer yet, so this states the limit rather than implying a "load more".
  //
  // The signal is the row count the QUERY returned, not the count that survived
  // parsing — `entries` is post-filter, so a full page of `limit` rows with any
  // of them dropped by `parseEntries` would otherwise render a truncated history
  // as a complete one, hiding the notice exactly when rows went missing.
  const returned = entries.length + skipped
  const isWindowed = returned >= limit

  // Per-row provider cost is already inside `describeEntry(...).why` (it is
  // appended there only when `cogsUsd` is non-null), so it is deliberately NOT
  // repeated in a column. `cogsUsd` is used here for the additive total instead.
  const recorded = entries.flatMap((entry) => {
    const value = cogsUsd(entry)
    return value === null ? [] : [value]
  })
  const recordedTotal = recorded.reduce((sum, value) => sum + value, 0)

  return (
    <div className="space-y-3">
      {/* The page body must never scroll horizontally — the table does instead. */}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] border-collapse text-left">
          <caption className="sr-only">
            {isWindowed
              ? `Credit activity, newest first — the ${limit} most recent entries`
              : 'Credit activity, newest first'}
          </caption>
          <thead>
            <tr className="border-b border-line text-[12px] text-faint">
              <th scope="col" className={cn(CELL, 'font-semibold')}>
                When
              </th>
              <th scope="col" className={cn(CELL, 'font-semibold')}>
                Activity
              </th>
              <th scope="col" className={cn(CELL, 'text-right font-semibold')}>
                Credits
              </th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry) => {
              const display = describeEntry(entry)
              const when = formatWhen(entry.created_at)

              return (
                <tr key={entry.id} className="border-b border-line last:border-b-0">
                  <td className={cn(CELL, 'text-[13px] whitespace-nowrap text-muted')}>
                    {when === null ? (
                      <span className="text-faint">Date not recorded</span>
                    ) : (
                      <time dateTime={entry.created_at} className="tabular-nums">
                        {when}
                      </time>
                    )}
                  </td>

                  <td className={CELL}>
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="text-[14px] font-semibold">{display.label}</span>
                      {display.pending ? (
                        // A HOLD is reserved, not spent — it must not read like a charge.
                        <span className="rounded-pill bg-s2 px-2 py-0.5 text-[11px] font-semibold text-muted">
                          Reserved
                        </span>
                      ) : null}
                    </span>
                    {display.why !== null ? (
                      <span className="mt-1 block text-[13px] text-muted">{display.why}</span>
                    ) : null}
                  </td>

                  <td
                    className={cn(
                      CELL,
                      'text-right text-[14px] font-semibold tabular-nums',
                      AMOUNT_TONE[display.direction],
                    )}
                  >
                    {display.signedAmount}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {isWindowed ? (
        <p className="text-[13px] text-faint">
          Showing the <span className="tabular-nums">{limit}</span> most recent entries. Older
          activity is not listed here.
        </p>
      ) : null}

      {recorded.length > 0 ? (
        <p className="text-[13px] text-faint">
          Provider cost recorded on <span className="tabular-nums">{recorded.length}</span> of these{' '}
          <span className="tabular-nums">{entries.length}</span> entries:{' '}
          {/* Floored, not rounded: a real sub-cent total must not print as $0.0000. */}
          <span className="tabular-nums">{formatUsdAmount(recordedTotal)}</span>. The rest recorded
          none, so they are not counted here.
        </p>
      ) : null}

      <SkippedNote skipped={skipped} />
    </div>
  )
}

/**
 * Rows dropped by `parseEntries`. Exported because the empty-ledger branch can
 * still have skipped rows — an all-malformed page would otherwise render as
 * "no activity yet", which is the one thing it is not.
 */
export function SkippedNote({ skipped }: { skipped: number }) {
  if (skipped <= 0) return null

  const one = skipped === 1

  return (
    <p className="text-[13px] text-warn">
      <span className="tabular-nums">{skipped}</span> {one ? 'entry' : 'entries'} could not be
      displayed — {one ? 'it did' : 'they did'} not match the ledger contract. Your balance above
      still counts {one ? 'it' : 'them'}.
    </p>
  )
}
