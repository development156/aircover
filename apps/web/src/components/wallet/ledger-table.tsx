import { Undo2 } from 'lucide-react'
import type { LedgerEntry } from '@sahoda/shared'

import { describeEntry, formatUsdAmount, type Direction } from '@/lib/wallet/entry-copy'
import { groupCorrections, type LedgerRow } from '@/lib/wallet/group-entries'
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

const formatCredits = (value: number): string => Math.abs(value).toLocaleString('en-IN')

/**
 * What a correction did to the balance, in the terms the reader is worried
 * about. Net zero is stated outright — "-100 Manual adjustment" sitting at the
 * top of a history is read as money taken, and the matching +100 two rows down
 * does not undo that impression on its own.
 */
function netEffectCopy(net: number): string {
  if (net === 0) return 'No change to your balance'

  const amount = formatCredits(net)

  return net > 0 ? `+${amount} credits to your balance` : `-${amount} credits from your balance`
}

/**
 * One ledger row. Shared by ungrouped entries and by correction members so the
 * two can never drift into rendering the same data differently.
 */
function EntryRow({ entry, corrected }: { entry: LedgerEntry; corrected: boolean }) {
  const display = describeEntry(entry)
  const when = formatWhen(entry.created_at)

  return (
    <tr className="border-b border-line last:border-b-0">
      <td className={cn(CELL, 'text-[13px] whitespace-nowrap text-muted')}>
        {when === null ? (
          <span className="text-muted">Date not recorded</span>
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
        {corrected ? (
          // Left in place, never rewritten: the ledger is append-only and this
          // row is still exactly what happened. But an entry that a later
          // correction has superseded must not read as though it still stands.
          <span className="mt-1 block text-[13px] text-warn">
            Corrected by a later entry. See the correction above.
          </span>
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
}

/**
 * A correction, rendered as one event.
 *
 * Its own `<tbody>` with a heading row: valid HTML (a table may hold several),
 * it gives the group a real accessible boundary rather than a decorative
 * border, and it keeps every member in the same three columns as everything
 * else. Both halves stay visible — the point is to explain the ledger, not to
 * hide rows from it.
 */
function CorrectionGroup({
  row,
  correctedSeqs,
}: {
  row: Extract<LedgerRow, { kind: 'correction' }>
  correctedSeqs: ReadonlySet<number>
}) {
  // Derived, not `useId`: this is a Server Component and hooks are unavailable
  // here — `useId` only appeared to work because the tests render it on the
  // client. Entry ids are uuids, so the first member's id is unique per group
  // and safe as an HTML id, and a group always has at least one member.
  const headingId = `correction-${row.entries[0]?.id ?? row.id}`

  return (
    <tbody aria-labelledby={headingId} className="border-b border-line last:border-b-0">
      <tr className="bg-s1">
        <td colSpan={3} className="px-3 py-2.5">
          <span id={headingId} className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="flex items-center gap-1.5 text-[13px] font-semibold">
              <Undo2 size={13} strokeWidth={2} aria-hidden />
              Correction
            </span>
            <span className="text-[13px] text-muted">·</span>
            <span className="text-[13px] font-semibold tabular-nums text-muted">
              {netEffectCopy(row.net)}
            </span>
          </span>
          <span className="mt-1 block text-[13px] text-muted">
            {row.entries.length === 1
              ? 'Part of a correction to an earlier entry. Its other half is outside the entries shown here.'
              : 'These entries were written together to correct an earlier one. Nothing was charged for them.'}
          </span>
        </td>
      </tr>
      {row.entries.map((entry) => (
        <EntryRow key={entry.id} entry={entry} corrected={correctedSeqs.has(entry.seq)} />
      ))}
    </tbody>
  )
}

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

  // A correction is written as two or more append-only rows that undo and
  // re-issue an earlier entry. Read as separate lines they look like a
  // clawback; grouped, they read as the one event they are.
  const { rows, correctedSeqs } = groupCorrections(entries)

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
            <tr className="border-b border-line text-[12px] text-muted">
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
          {rows.map((row) =>
            row.kind === 'correction' ? (
              <CorrectionGroup key={row.id} row={row} correctedSeqs={correctedSeqs} />
            ) : (
              <tbody key={row.entry.id}>
                <EntryRow entry={row.entry} corrected={correctedSeqs.has(row.entry.seq)} />
              </tbody>
            ),
          )}
        </table>
      </div>

      {isWindowed ? (
        <p className="text-[13px] text-muted">
          Showing the <span className="tabular-nums">{limit}</span> most recent entries. Older
          activity is not listed here.
        </p>
      ) : null}

      {recorded.length > 0 ? (
        <p className="text-[13px] text-muted">
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
