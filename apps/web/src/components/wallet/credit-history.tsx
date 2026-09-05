'use client'

import { useState } from 'react'

import { CreditActivity } from '@/components/wallet/credit-activity'
import type { LedgerEntry } from '@sahoda/shared'

/**
 * THE LAST THIRTY DAYS, AND EVERYTHING ELSE BEHIND ONE PRESS.
 *
 * ── WHY THE PAGE DOES NOT OPEN ON THE WHOLE LEDGER ───────────────────────────
 * Somebody arriving at the wallet is asking one of two questions: how much have I
 * got, and where did it go lately. A table of two hundred entries with four
 * filters above it answers the second question badly — the recent rows, which are
 * the ones they came for, are buried under machinery they did not ask for.
 *
 * So the page shows the same window the graph above it draws, and the full ledger
 * with its filters and paging is one press away. Founder's ruling, 2026-09-03.
 *
 * ── THE COUNTS ARE REAL ON BOTH SIDES OF THE PRESS ───────────────────────────
 * The collapsed view says how many entries the window holds; the button says how
 * many there are altogether. Neither is a guess: the window is counted from the
 * rows in hand, and the total comes from the database. When the total could not be
 * read the button stops claiming a number rather than printing one.
 */
export const HISTORY_WINDOW_DAYS = 30

/** Entries inside the window, newest first. Anything unparseable was already dropped upstream. */
export function withinWindow(
  entries: readonly LedgerEntry[],
  now: Date,
  days = HISTORY_WINDOW_DAYS,
): LedgerEntry[] {
  const floor = now.getTime() - days * 86_400_000
  return entries.filter((entry) => {
    const at = new Date(entry.created_at).getTime()
    // An unparseable date is kept rather than hidden: dropping a real entry from
    // a money list because its timestamp confused us is the worse of the two errors.
    return Number.isNaN(at) || at >= floor
  })
}

export function CreditHistory({
  entries,
  skipped,
  limit,
  total,
  now,
}: {
  entries: readonly LedgerEntry[]
  skipped: number
  limit: number
  /** Entries in the ledger, from the database. `null` = the count failed. */
  total: number | null
  /** Read on the server and passed down, so the window cannot drift between renders. */
  now: string
}) {
  const [expanded, setExpanded] = useState(false)
  const recent = withinWindow(entries, new Date(now))
  const older = entries.length - recent.length

  if (expanded) {
    return <CreditActivity entries={entries} skipped={skipped} limit={limit} total={total} />
  }

  return (
    <div className="space-y-3">
      <CreditActivity entries={recent} skipped={skipped} limit={limit} total={recent.length} />
      {older > 0 || (total !== null && total > entries.length) ? (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="surface-ring-firm inline-flex h-control items-center rounded-sm bg-surface px-3 type-sm font-[550] text-ink transition-micro hover:bg-s2"
        >
          {total === null
            ? 'Show everything, with filters'
            : `Show all ${total.toLocaleString('en-IN')} entries, with filters`}
        </button>
      ) : null}
    </div>
  )
}
