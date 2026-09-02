import { Undo2 } from 'lucide-react'
import type { LedgerEntry } from '@sahoda/shared'

import { describeEntry, formatUsdAmount, type Direction } from '@/lib/wallet/entry-copy'
import { isSahodaActor } from '@/lib/wallet/actor'
import { isOpenHold, settledHoldIds } from '@/lib/wallet/hold-settlement'
import { groupCorrections, type LedgerRow } from '@/lib/wallet/group-entries'
import { cogsUsd } from '@/lib/wallet/parse-entries'
import { cn } from '@/lib/utils'
import { creditWord } from '@/lib/credit-words'

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
  /**
   * Which holds are closed, computed over EVERY entry that was read.
   *
   * ── THE DEFECT THIS PROP EXISTS FOR ─────────────────────────────────────────
   * `settledHoldIds(entries)` used to be derived inside this component, and its
   * comment justified that: "a settling entry always has a higher `seq` than its
   * hold, and the page is the top N by `seq DESC`, so any visible hold has its
   * settlement visible too." That argument is exactly true of ONE page of fifty
   * and exactly false of a paginated list. A hold on page two whose DEBIT sits
   * on page one would be handed a set derived from page two alone, find no
   * settlement, and render the word "Reserved" — telling somebody credits are
   * frozen that were spent days ago.
   *
   * So the caller that paginates computes this once over the whole window and
   * passes it down. Omitted, the old derivation still applies, which is correct
   * for any caller rendering every entry it holds.
   */
  settled?: ReadonlySet<string>
  /** Adds the running balance column. Every row records `balance_after`. */
  showBalance?: boolean
  /**
   * The trailing notes — the window notice, the provider-cost total and the
   * skipped-row warning. A paginated caller owns those sentences, because each
   * is about the WHOLE history rather than the rows on screen, and printing
   * them under one page of ten would scope them to the wrong set.
   */
  notes?: boolean
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

/**
 * The phone's date. Same instant, same pinned zone, fewer parts.
 *
 * MEASURED at 390px: the full stamp wraps to FOUR lines in the column it is
 * given ("30 Aug / 2026, / 02:30 / pm"), which makes every row twice as tall as
 * its content and turns a ten-row page into a scroll. Both spellings are
 * rendered and CSS picks one, so the `<time datetime>` — the machine-readable
 * value, and the one a screen reader can be given in full — is identical either
 * way. Nothing is hidden from anybody: the full stamp is a rotation away.
 */
const WHEN_SHORT = new Intl.DateTimeFormat('en-IN', {
  day: '2-digit',
  month: 'short',
  timeZone: 'Asia/Kolkata',
})

function formatWhen(iso: string): string | null {
  const ms = Date.parse(iso)
  return Number.isFinite(ms) ? WHEN.format(ms) : null
}

function formatWhenShort(iso: string): string | null {
  const ms = Date.parse(iso)
  return Number.isFinite(ms) ? WHEN_SHORT.format(ms) : null
}

/**
 * ── TONE RECEDES A ROW. IT NEVER SAYS WHICH WAY THE MONEY WENT ───────────────
 * This comment used to read "credit rows read green; debits stay ink", and it
 * had been false since `--ok` was re-solved: MEASURED off `tokens.css`, `--ok`
 * is `#000000` in light and `#ffffff` in dark — the same value as `--ink` in
 * both. So `credit` and `debit` render byte-identically and always have; the
 * comment was describing a green that no longer exists in this palette.
 *
 * That is not a bug to repair by reintroducing the colour. docs/37 §1 refuses
 * green-up/red-down on purpose: direction is carried by the SIGN GLYPH on the
 * amount (`+100`, `-3`), which survives greyscale, re-theming and colour
 * blindness, and which `describeEntry` derives from `entry_type` and never from
 * the stored magnitude — `credit_ledger` stores a debit POSITIVE, and a screen
 * that read the sign off the amount once reported every spend as `+100`.
 *
 * What tone still does is push the two rows that never moved the total — HOLD
 * and RELEASE — behind the ones that did. That is the only job left, so the map
 * now says so rather than promising a colour it does not paint.
 */
const AMOUNT_TONE: Record<Direction, string> = {
  credit: 'text-ink',
  debit: 'text-ink',
  neutral: 'text-muted',
}

// The DataTable recipe (ui/data-table.tsx): 12px inset, 10px of row padding.
const CELL = 'px-3 py-2.5 align-top'

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

  // `amount` is already formatted for display, so the WORD has to come from the
  // number. Magnitude, not sign: "-1 credits from your balance" is the same slip
  // one line down from where it was just fixed.
  const word = creditWord(Math.abs(net))

  return net > 0 ? `+${amount} ${word} to your balance` : `-${amount} ${word} from your balance`
}

/**
 * One ledger row. Shared by ungrouped entries and by correction members so the
 * two can never drift into rendering the same data differently.
 */
function EntryRow({
  entry,
  corrected,
  open,
  showBalance,
}: {
  entry: LedgerEntry
  corrected: boolean
  /** Credits frozen RIGHT NOW — a HOLD with no settling entry in the window. */
  open: boolean
  showBalance: boolean
}) {
  const display = describeEntry(entry)
  const when = formatWhen(entry.created_at)

  return (
    <tr
      data-testid={`ledger-row-${entry.seq}`}
      // A ledger row RECORDS something that already happened, so `real` is the
      // baseline and only unresolved money needs marking. Painting every settled
      // row with a solid fill would be noise saying one thing. `simulated` and
      // `proposed` never occur here: both describe things that have not
      // happened, and every row is a fact.
      data-certainty={open ? 'committed' : 'real'}
      className="border-b border-line-soft transition-micro last:border-b-0 hover:bg-s2"
    >
      {/* `whitespace-normal` below `narrow`: "30 Aug 2026, 02:30 pm" on one
          line is ~150px of a 390px screen, and wrapping it to two costs a row
          of height and buys back the width the amount column needs. */}
      <td className={cn(CELL, 'type-sm text-muted narrow:whitespace-nowrap')}>
        {when === null ? (
          <span className="text-muted">Date not recorded</span>
        ) : (
          <time dateTime={entry.created_at} className="tabular-nums">
            <span className="narrow:hidden">{formatWhenShort(entry.created_at)}</span>
            <span className="hidden narrow:inline">{when}</span>
          </time>
        )}
      </td>

      <td className={CELL}>
        <span className="flex flex-wrap items-center gap-2">
          {isSahodaActor(entry.actor) ? (
            <span className="blade" role="img" aria-label="Sahoda did this on its own" />
          ) : null}
          <span className="type-body font-semibold">{display.label}</span>
          {open ? (
            // Credits reserved and not yet resolved: committed, not real. Only
            // an UNSETTLED hold earns this — a settled one is history, and
            // saying "Reserved" over it claims money is frozen that is not.
            <span className="is-committed type-eyebrow rounded-pill px-2 py-0.5">Reserved</span>
          ) : null}
        </span>
        {display.why !== null ? (
          <span data-testid={`ledger-why-${entry.seq}`} className="mt-1 block type-sm text-muted">
            {display.why}
          </span>
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
        data-testid={`ledger-amount-${entry.seq}`}
        className={cn(
          CELL,
          // `.num` is the token-file class: mono + tabular-nums. Amounts are the
          // one column that must align down the page for the ledger to be
          // readable as a ledger.
          'num text-right type-body font-semibold',
          AMOUNT_TONE[display.direction],
        )}
      >
        {display.signedAmount}
      </td>

      {/* ── THE BALANCE AFTER THIS ENTRY, AS THE LEDGER RECORDED IT ──────────
          `credit_ledger.balance_after` is written by `apply_ledger_entry` in the
          same transaction as the entry, so this is the stored figure and not a
          running total this component added up. That distinction is the whole
          reason the column can exist at all: a balance recomputed in the browser
          over a WINDOW of the history would be wrong for everyone whose ledger
          is longer than the window, and wrong about their money.

          A HOLD's `balance_after` is the spendable total, which a hold does not
          move — so the column repeats the row above it on a reservation, which
          is correct and is what the ledger says. */}
      {showBalance ? (
        /* ── HIDDEN ON A PHONE, AND THE CHOICE OF WHICH COLUMN GOES MATTERS ──
           MEASURED at 400px: with five columns the table needed 560px inside a
           390px screen, so `overflow-x-auto` pushed CREDITS and BALANCE off the
           right edge — the two figures the whole screen is for, reachable only
           by a sideways drag most people never try.

           The running balance is the one that goes, because it is derivable:
           the balance after any row is the balance shown on the row above it,
           less that row's own amount. The amount is not derivable from
           anything. So the phone keeps what it cannot reconstruct. */
        <td
          className={cn(
            CELL,
            'num hidden text-right type-body whitespace-nowrap text-muted narrow:table-cell',
          )}
        >
          {entry.balance_after.toLocaleString('en-IN')}
        </td>
      ) : null}
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
  settled,
  showBalance,
}: {
  row: Extract<LedgerRow, { kind: 'correction' }>
  correctedSeqs: ReadonlySet<number>
  /** Ids of holds closed by an entry in the window — see hold-settlement.ts. */
  settled: ReadonlySet<string>
  showBalance: boolean
}) {
  // Derived, not `useId`: this is a Server Component and hooks are unavailable
  // here — `useId` only appeared to work because the tests render it on the
  // client. Entry ids are uuids, so the first member's id is unique per group
  // and safe as an HTML id, and a group always has at least one member.
  const headingId = `correction-${row.entries[0]?.id ?? row.id}`
  // Ascending and de-duplicated by `groupCorrections`; may legitimately be empty
  // when neither half recorded a reference.
  const corrects = row.corrects

  return (
    <tbody aria-labelledby={headingId} className="border-b border-line last:border-b-0">
      <tr className="bg-s1">
        <td colSpan={showBalance ? 4 : 3} className="px-3 py-2.5">
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
          <span className="mt-1 block type-sm text-muted">
            {row.entries.length === 1
              ? 'Part of a correction to an earlier entry. Its other half is outside the entries shown here.'
              : 'These entries were written together to correct an earlier one. Nothing was charged for them.'}
          </span>
          {/* Name the entry this corrects, from the RECORDED linkage only.
              `corrects` comes from `meta.reverses_seq` / `meta.replaces_seq`;
              the entry itself is very often scrolled off the page, and going to
              fetch it — or reconstructing a label for it — would be inventing
              detail the correction never recorded. A bare seq is verifiable: the
              user can scroll to it. When nothing was recorded, this says
              nothing rather than guessing. */}
          {corrects.length > 0 ? (
            <span className="mt-1 block type-sm text-muted">
              {corrects.length === 1 ? 'Corrects entry ' : 'Corrects entries '}
              {corrects.map((seq, index) => (
                <span key={seq}>
                  {index > 0 ? ', ' : ''}
                  <span className="num">#{seq}</span>
                </span>
              ))}
              .
            </span>
          ) : null}
        </td>
      </tr>
      {row.entries.map((entry) => (
        <EntryRow
          key={entry.id}
          entry={entry}
          corrected={correctedSeqs.has(entry.seq)}
          open={isOpenHold(entry, settled)}
          showBalance={showBalance}
        />
      ))}
    </tbody>
  )
}

export function LedgerTable({
  entries,
  skipped,
  limit,
  settled: settledProp,
  showBalance = false,
  notes = true,
}: LedgerTableProps) {
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

  // Derived once for the page, not per row. Safe to read from this page alone:
  // a settling entry always has a higher `seq` than its hold, and the page is
  // the top N by `seq DESC`, so any visible hold has its settlement visible too.
  const settled = settledProp ?? settledHoldIds(entries)

  return (
    <div className="space-y-3">
      {/* The page body must never scroll horizontally — the table does instead. */}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[340px] border-collapse text-left narrow:min-w-[560px]">
          <caption className="sr-only">
            {isWindowed
              ? `Credit activity, newest first: the ${limit} most recent entries`
              : 'Credit activity, newest first'}
          </caption>
          <thead>
            {/* `type-eyebrow` headers: the one header recipe every table in
                the product shares (ui/data-table.tsx). This one had its own. */}
            <tr className="border-b border-line-soft text-muted">
              <th scope="col" className={cn(CELL, 'type-eyebrow')}>
                When
              </th>
              <th scope="col" className={cn(CELL, 'type-eyebrow')}>
                Activity
              </th>
              <th scope="col" className={cn(CELL, 'type-eyebrow text-right')}>
                Credits
              </th>
              {showBalance ? (
                <th
                  scope="col"
                  className={cn(CELL, 'type-eyebrow hidden text-right narrow:table-cell')}
                >
                  Balance
                </th>
              ) : null}
            </tr>
          </thead>
          {rows.map((row) =>
            row.kind === 'correction' ? (
              <CorrectionGroup
                key={row.id}
                row={row}
                correctedSeqs={correctedSeqs}
                settled={settled}
                showBalance={showBalance}
              />
            ) : (
              <tbody key={row.entry.id}>
                <EntryRow
                  entry={row.entry}
                  corrected={correctedSeqs.has(row.entry.seq)}
                  open={isOpenHold(row.entry, settled)}
                  showBalance={showBalance}
                />
              </tbody>
            ),
          )}
        </table>
      </div>

      {notes && isWindowed ? (
        <p className="text-[13px] text-muted">
          Showing the <span className="tabular-nums">{limit}</span> most recent entries. Older
          activity is not listed here.
        </p>
      ) : null}

      {notes && recorded.length > 0 ? (
        <p className="text-[13px] text-muted">
          Provider cost recorded on <span className="tabular-nums">{recorded.length}</span> of these{' '}
          <span className="tabular-nums">{entries.length}</span> entries:{' '}
          {/* Floored, not rounded: a real sub-cent total must not print as $0.0000. */}
          <span className="tabular-nums">{formatUsdAmount(recordedTotal)}</span>. The rest recorded
          none, so they are not counted here.
        </p>
      ) : null}

      {notes ? <SkippedNote skipped={skipped} /> : null}
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
      displayed, because {one ? 'it did' : 'they did'} not match the ledger contract. Your balance
      above still counts {one ? 'it' : 'them'}.
    </p>
  )
}
