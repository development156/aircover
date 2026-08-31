import type { LedgerEntry } from '@sahoda/shared'

import { describeEntry, signedEffect, type Direction } from './entry-copy'

/**
 * The arithmetic behind the credit-activity list: filtering, paging, and the
 * page numbers the pager draws.
 *
 * It is a separate module from the component for one reason. Everything here is
 * a claim about somebody's money — how many entries there are, which window of
 * them is on screen, how much was spent — and a claim like that is worth pinning
 * with a test that does not need a DOM to run.
 */

/** Which entries the reader asked to see. */
export type ActivityKind = 'all' | 'spent' | 'added' | 'reserved'

/**
 * ── THE FILTER NAMES THE PRODUCT'S OWN CATEGORIES, NOT A GENERIC SET ─────────
 * The brief asked for "All activities / Credits spent / Credits earned /
 * Refunds". Three of those exist here and the fourth does not, so it is not
 * offered.
 *
 * A refund in this ledger is a RELEASE — credits come out of a hold and back
 * into the spendable balance — and `entry-copy.ts` classifies it as NEUTRAL,
 * because the hold never left the wallet total in the first place. Listing
 * "Refunds" as a category of money coming IN would state the opposite of what
 * the ledger records. The honest fourth option is the one the data actually
 * has: money set aside and money handed back, which is `reserved`.
 *
 * `earned` is likewise not a word this ledger uses. GRANT, TOPUP and
 * PERF_REWARD are all "added" — bought, given, or awarded — and one of those
 * three is a purchase, which nobody earned.
 */
export const ACTIVITY_KINDS: { value: ActivityKind; label: string }[] = [
  { value: 'all', label: 'All activity' },
  { value: 'spent', label: 'Credits spent' },
  { value: 'added', label: 'Credits added' },
  { value: 'reserved', label: 'Reserved and returned' },
]

const KIND_OF: Record<Direction, ActivityKind> = {
  debit: 'spent',
  credit: 'added',
  neutral: 'reserved',
}

/** The words a search looks through, lower-cased once per entry. */
function haystack(entry: LedgerEntry): string {
  const display = describeEntry(entry)
  return [display.label, display.why ?? '', entry.action_type ?? '', entry.entry_type]
    .join(' ')
    .toLowerCase()
}

export function matchesKind(entry: LedgerEntry, kind: ActivityKind): boolean {
  if (kind === 'all') return true
  return KIND_OF[describeEntry(entry).direction] === kind
}

/**
 * Narrows on EVERY word, not on any of them.
 *
 * "brand video" must mean both words, or a two-word search returns more rows
 * than a one-word search and the field reads as broken. Same rule as
 * /connections' catalogue search, and it is asserted the same way.
 */
export function matchesQuery(entry: LedgerEntry, query: string): boolean {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean)
  if (terms.length === 0) return true
  const hay = haystack(entry)
  return terms.every((term) => hay.includes(term))
}

export function filterEntries(
  entries: readonly LedgerEntry[],
  { kind, query }: { kind: ActivityKind; query: string },
): LedgerEntry[] {
  return entries.filter((entry) => matchesKind(entry, kind) && matchesQuery(entry, query))
}

/**
 * What the filtered entries add up to, in the ledger's own arithmetic.
 *
 * `signedEffect` rather than `amount`: `credit_ledger` stores a DEBIT as a
 * POSITIVE number, so summing the column directly makes a +30 spend and a +30
 * grant agree when they point opposite ways. A HOLD and its RELEASE contribute
 * zero, because neither moves the wallet total.
 *
 * ── THIS IS A TOTAL FOR THE ENTRIES ON THIS PAGE'S DATA, NOT A LIFETIME ONE ──
 * The read is windowed to the newest `HISTORY_LIMIT` rows. A workspace with
 * more history than that has spend these numbers cannot see, so the UI must
 * label them as covering the entries listed and never as "total spent". The
 * component does; this function only does the arithmetic, and `covers` is
 * returned so the caller cannot forget how many entries went into it.
 */
export interface ActivityTotals {
  spent: number
  added: number
  net: number
  /** How many entries these three numbers were computed over. */
  covers: number
}

export function totalsFor(entries: readonly LedgerEntry[]): ActivityTotals {
  let spent = 0
  let added = 0

  for (const entry of entries) {
    const effect = signedEffect(entry)
    if (effect < 0) spent += -effect
    else if (effect > 0) added += effect
  }

  return { spent, added, net: added - spent, covers: entries.length }
}

/** Row counts the reader may choose between. */
export const PER_PAGE_OPTIONS = [10, 25, 50, 100] as const
export type PerPage = (typeof PER_PAGE_OPTIONS)[number]

export function pageCount(total: number, perPage: number): number {
  // One page, always. A pager reading "Page 1 of 0" over an empty list is a
  // sentence about nothing, and `clampPage` needs a floor to clamp to.
  if (total <= 0 || perPage <= 0) return 1
  return Math.ceil(total / perPage)
}

/** Keeps the current page inside the pages that exist. */
export function clampPage(page: number, total: number, perPage: number): number {
  const last = pageCount(total, perPage)
  if (!Number.isFinite(page)) return 1
  return Math.min(Math.max(Math.trunc(page), 1), last)
}

/**
 * "Showing 11 to 20 of 43" — one-based and INCLUSIVE, which is how the sentence
 * reads to a person.
 *
 * The empty case returns zeroes rather than `1 to 0`, and the caller renders a
 * different sentence for it. An off-by-one here is a wrong number about the
 * reader's own records, which is why it has its own test rather than being
 * inlined into the JSX.
 */
export function showingRange(
  page: number,
  perPage: number,
  total: number,
): { from: number; to: number } {
  if (total <= 0) return { from: 0, to: 0 }
  const safe = clampPage(page, total, perPage)
  const from = (safe - 1) * perPage + 1
  return { from, to: Math.min(safe * perPage, total) }
}

/** A gap in the page numbers. Rendered as an ellipsis, never as a control. */
export const GAP = 'gap' as const
export type PageSlot = number | typeof GAP

/**
 * The page numbers the pager draws.
 *
 * Ten pages or fewer: every one of them, which is the reference's own layout.
 * Beyond that, the first, the last, and a run of five centred on where you are,
 * with an ellipsis wherever the sequence jumps.
 *
 *   page 1  of 24  →  1 2 3 4 5 … 24
 *   page 10 of 24  →  1 … 8 9 10 11 12 … 24
 *   page 24 of 24  →  1 … 20 21 22 23 24
 *
 * ── A GAP THAT HIDES ONE PAGE IS REPLACED BY THAT PAGE ──────────────────────
 * At page 5 the run is 3 to 7 and the only thing between it and page 1 is page
 * 2. An ellipsis there is longer than the number it conceals and it costs the
 * reader a click, so the number is drawn instead. Small, and it is the
 * difference between a pager that feels considered and one that does not.
 */
export function pageSlots(current: number, total: number, run = 5, showAllUpTo = 10): PageSlot[] {
  if (total <= 1) return [1]
  const page = Math.min(Math.max(Math.trunc(current), 1), total)

  if (total <= showAllUpTo) return Array.from({ length: total }, (_, i) => i + 1)

  const half = Math.floor(run / 2)
  // Clamped so the run keeps its length at both ends rather than shrinking:
  // page 1 of 24 shows 1 to 5, not 1 to 3.
  let start = Math.max(1, page - half)
  let end = Math.min(total, start + run - 1)
  start = Math.max(1, end - run + 1)

  const slots: PageSlot[] = []
  for (let i = start; i <= end; i += 1) slots.push(i)

  if (start > 1) {
    // Exactly one page hidden → draw it. Two or more → an ellipsis.
    if (start === 3) slots.unshift(2)
    else if (start > 3) slots.unshift(GAP)
    if (start > 2 || slots[0] === 2) slots.unshift(1)
  }
  if (end < total) {
    if (end === total - 2) slots.push(total - 1)
    else if (end < total - 2) slots.push(GAP)
    slots.push(total)
  }

  return slots
}
