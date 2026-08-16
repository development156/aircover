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
      <p className="px-4 py-6 text-center text-[13px] text-muted">
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
        const isCredit = entry.amount > 0
        const Glyph = isCredit ? Check : Sparkles
        return (
          <li
            key={entry.seq}
            className="flex items-center gap-[10px] border-b border-line-soft py-[10px] last:border-b-0"
          >
            <span className="grid size-6 shrink-0 place-items-center rounded-sm bg-s2 text-muted">
              <Glyph size={13} strokeWidth={1.8} aria-hidden />
            </span>
            <span className="min-w-0 flex-1 truncate text-[12px] text-ink">{display.label}</span>
            <span className="shrink-0 text-[12px] font-[550] tabular-nums text-muted">
              {isCredit ? `+${entry.amount}` : entry.amount}
            </span>
          </li>
        )
      })}
    </ul>
  )
}
