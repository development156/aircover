import type { LedgerEntry } from '@sahoda/shared'

/**
 * Which holds are still OPEN — credits frozen right now.
 *
 * This is deliberately not a property of a single entry, which is why it does
 * not live on `describeEntry`. A HOLD row cannot know whether it was settled;
 * only the entries around it can say. Deriving "Reserved" from
 * `entry_type === 'HOLD'` — as the wallet did — makes every completed charge
 * render two rows, `Reserved −3` above `−3`, telling the account owner that
 * credits are frozen at this moment when they were charged and the hold closed,
 * possibly months ago.
 *
 * Openness is the ABSENCE of a settling entry. `settles_entry_id` is unique on
 * `credit_ledger`, so at most one entry settles any given hold. It may be a
 * DEBIT (the work succeeded, the credits were spent) or a RELEASE (it failed, or
 * the reaper swept an expired hold, and the credits went back). Both CLOSE the
 * hold — only the reason differs, and the reason belongs to the settling row,
 * not to the hold.
 *
 * `hold_expires_at` is not the signal and must never be used as one: it survives
 * settlement, so filtering on it reports every past charge as stuck credits.
 */

/**
 * The ids of holds settled by an entry on this page.
 *
 * WHY READING ONE PAGE IS SAFE. `seq` is a monotonic identity and a settling
 * entry is always written after the hold it settles, so `settlement.seq >
 * hold.seq`. The wallet reads the top N by `seq DESC`, which makes the page a
 * gap-free suffix of the sequence: if a hold is on the page, every entry newer
 * than it is on the page too — including its settlement.
 *
 * So the dangerous direction is impossible. A settled hold whose settlement fell
 * outside the window would render "Reserved" over closed credits, and that
 * cannot occur. The reverse — a settlement whose hold has scrolled away — is
 * harmless: the hold is not rendered, so nothing claims anything about it.
 *
 * This means no extra query. `readLedger` already selects `*`, so the linkage is
 * on rows the page has in hand.
 */
export function settledHoldIds(entries: readonly LedgerEntry[]): ReadonlySet<string> {
  const settled = new Set<string>()
  for (const entry of entries) {
    // PostgREST hands these back untyped; a coerced value would close an
    // arbitrary hold, so anything that is not a string is ignored.
    const target: unknown = entry.settles_entry_id
    if (typeof target === 'string' && target.length > 0) settled.add(target)
  }
  return settled
}

/** True only for a HOLD with no settling entry — credits frozen right now. */
export function isOpenHold(
  entry: Pick<LedgerEntry, 'id' | 'entry_type'>,
  settled: ReadonlySet<string>,
): boolean {
  return entry.entry_type === 'HOLD' && !settled.has(entry.id)
}
