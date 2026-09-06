import type { LedgerEntry } from '@sahoda/shared'

import { HISTORY_LIMIT } from '@/lib/wallet/read'

/**
 * THE CREDIT BALANCE, DAY BY DAY, FROM ROWS THE PAGE ALREADY HOLDS.
 *
 * ── WHY THIS IS THE ONE CHART EVERY WORKSPACE CAN DRAW ON DAY ONE ────────────
 * Every other series on /home comes from a platform (followers, reach) or from
 * spending (the 30-day debit line), and a new workspace has neither. But every
 * workspace has a ledger from the moment it exists — the welcome grant is its
 * first row — and every ledger row carries `balance_after`, the total the
 * wallet held once that row landed. So the balance over the last thirty days is
 * not inferred, interpolated or modelled: it is the ledger's own column, read
 * off at the end of each day.
 *
 * ── AND IT COSTS NO QUERY ────────────────────────────────────────────────────
 * `readLedger` already fetches the newest `HISTORY_LIMIT` rows for the activity
 * feed. This walks those. When the list is shorter than the limit it is the
 * whole ledger, so days before the first row are a real zero (no wallet yet).
 * When it is exactly the limit, older days may exist that were not read, and
 * those days are `null` — the line starts where knowledge starts, which is the
 * rule every absence on this page follows.
 */
export interface BalanceDay {
  /** `YYYY-MM-DD` in UTC. */
  date: string
  /** The wallet's total at the end of that day, or `null` when nothing was read for it. */
  total: number | null
}

export const BALANCE_DAYS = 30

function dayKey(date: Date): string {
  return date.toISOString().slice(0, 10)
}

export function balanceSeries(
  entries: readonly LedgerEntry[],
  now: Date,
  days: number = BALANCE_DAYS,
): BalanceDay[] {
  // Oldest first, by `seq`: the identity column, because `created_at` can
  // invert for rows written inside one transaction (see wallet/read.ts).
  const ordered = [...entries].sort((a, b) => a.seq - b.seq)
  const complete = ordered.length < HISTORY_LIMIT
  const firstKnownDay = ordered[0] ? dayKey(new Date(ordered[0].created_at)) : null

  const out: BalanceDay[] = []
  let cursor = 0
  let last: number | null = complete ? 0 : null

  for (let i = days - 1; i >= 0; i -= 1) {
    const key = dayKey(new Date(now.getTime() - i * 86_400_000))
    // Consume every row on or before this day; the last one wins the day.
    while (cursor < ordered.length && dayKey(new Date(ordered[cursor]!.created_at)) <= key) {
      last = ordered[cursor]!.balance_after
      cursor += 1
    }
    // A capped read knows nothing before its oldest row.
    const known = complete || (firstKnownDay !== null && key >= firstKnownDay)
    out.push({ date: key, total: known ? last : null })
  }
  return out
}
