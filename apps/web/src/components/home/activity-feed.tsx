import { Check, Sparkles } from 'lucide-react'
import type { LedgerEntry } from '@sahoda/shared'

import { describeEntry } from '@/lib/wallet/entry-copy'

/**
 * The activity feed (reference `.act`), for the right rail.
 *
 * ── WHY NOT THE LEDGER TABLE ─────────────────────────────────────────────────
 * Home used to render `<LedgerTable>` full-width at the bottom of the page.
 * Moved into a 380px rail it overflowed and grew a horizontal scrollbar, which
 * is the honest signal that a table is the wrong component here: a table is for
 * comparing rows across columns, and nobody scans "when / activity / credits"
 * columns in a sidebar. The reference uses a three-part ROW — glyph, what
 * happened, how long ago — and that is what a feed is.
 *
 * The full table still exists, unchanged, on /wallet, which is where you go to
 * compare entries. The "View all" link goes there.
 *
 * ── THE NUMBER STAYS ─────────────────────────────────────────────────────────
 * Credits are shown per row. This is a ledger surface, and dropping the amount
 * to make the row fit would leave a feed that says something happened without
 * saying what it cost — the one thing a credit entry is for.
 */
export function ActivityFeed({ entries }: { entries: LedgerEntry[] }) {
  if (entries.length === 0) {
    return (
      <p className="px-4 py-6 text-center type-sm text-muted">
        Nothing has happened yet. Credits you spend or receive show up here.
      </p>
    )
  }

  return (
    <ul className="px-4 py-1">
      {entries.map((entry) => {
        // A grant is something that arrived; a spend is something Sahoda did.
        // `describeEntry` is the ONE place a ledger row gets its words. A
        // second label written here is a second chance to describe money
        // differently from the table that shows the same row.
        const display = describeEntry(entry)
        // ⚠ THE SIGN IS NOT IN `amount`, AND READING IT THERE INVERTED EVERY
        // SPEND ON THIS CARD.
        //
        // `credit_ledger` carries a CHECK constraint:
        //   (entry_type = 'ADJUST' and amount <> 0)
        //   or (entry_type <> 'ADJUST' and amount > 0)
        // so a DEBIT's amount is POSITIVE by definition and the direction lives
        // in `entry_type`. `entry.amount > 0` was therefore true for every row
        // in the table, and Home rendered a 100-credit SPEND as "+100" with a
        // tick — directly above a balance of 0. MEASURED on the zero-balance
        // journey: "Ux probe +100" and "Welcome credits +100" read as +200
        // arriving, while /wallet showed the same first row as -100.
        //
        // `describeEntry` already answers this, and this component was already
        // calling it — for the label only, then re-deriving the sign itself.
        // A second derivation is a second chance to describe money differently
        // from the table showing the same row, which is exactly what happened.
        const Glyph = display.direction === 'debit' ? Sparkles : Check
        return (
          <li
            key={entry.seq}
            className="flex items-center gap-[10px] border-b border-line-soft py-[10px] last:border-b-0"
          >
            <span className="grid size-6 shrink-0 place-items-center rounded-sm bg-s2 text-muted">
              <Glyph size={13} strokeWidth={1.8} aria-hidden />
            </span>
            <span className="min-w-0 flex-1 truncate type-meta text-ink">{display.label}</span>
            <span className="shrink-0 type-meta font-[550] tabular-nums text-muted">
              {display.signedAmount}
            </span>
          </li>
        )
      })}
    </ul>
  )
}
