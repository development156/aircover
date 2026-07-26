import type { LedgerEntry } from '@sahoda/shared'

import { correctionMeta } from './correction'
import { signedEffect } from './entry-copy'

/**
 * Turn a flat ledger into rows the wallet can render, collapsing each
 * correction into one.
 *
 * The sequence this exists for, as actually stored: seq 5374 was a manual GRANT
 * of 100 credits that the wallet mislabelled. `credit_ledger` is append-only,
 * so the fix was two more rows — seq 5597 reversing it (-100) and seq 5596
 * re-issuing it correctly (+100). Newest-first, the user meets:
 *
 *     -100  Manual adjustment
 *     +100  Manual adjustment
 *     …
 *     +100  Credits added by Sahoda      ← seq 5374, scrolled away
 *
 * Three correct rows, net zero, and the account owner sees 100 credits taken
 * off the top of their history with nothing attached explaining it. The money
 * is right; the story is wrong. Grouping is what makes the correction read as
 * the single event it is.
 *
 * Pure: the input array is never mutated and nothing is read from the clock.
 */

export type LedgerRow =
  | { kind: 'entry'; entry: LedgerEntry }
  | {
      kind: 'correction'
      /** The shared `meta.correction` id. Grouping key, never rendered. */
      id: string
      /** Members, in the order they arrived (newest first). */
      entries: LedgerEntry[]
      /** Net credits moved, so the group can say whether anything changed. */
      net: number
      /** `seq` of each entry this correction acts on, ascending, de-duplicated. */
      corrects: number[]
    }

export interface GroupedLedger {
  rows: LedgerRow[]
  /**
   * Every `seq` a visible correction names. The table marks those entries so a
   * superseded row is not left reading as though it still stands.
   */
  correctedSeqs: ReadonlySet<number>
}

interface Accumulator {
  id: string
  entries: LedgerEntry[]
  net: number
  corrects: Set<number>
}

/**
 * Group by the recorded `meta.correction` id and nothing else.
 *
 * Adjacency is deliberately NOT a signal: two unrelated manual adjustments that
 * happen to sit next to each other look exactly like a correction pair on
 * screen, and inventing a link between them would fabricate an event.
 *
 * Each group lands where its FIRST (newest) member sat, so the list stays
 * newest-first. Hoisting corrections to the top would park them beside entries
 * they have nothing to do with.
 *
 * A lone half — its partner pushed out by the 50-row window — is still a group.
 * The window is a display cap, not a data boundary, and one labelled row beats
 * an unexplained -100 the user cannot place.
 */
export function groupCorrections(entries: readonly LedgerEntry[]): GroupedLedger {
  const groups = new Map<string, Accumulator>()
  const rows: LedgerRow[] = []
  const correctedSeqs = new Set<number>()

  for (const entry of entries) {
    const meta = correctionMeta(entry)

    if (meta === null) {
      rows.push({ kind: 'entry', entry })
      continue
    }

    let group = groups.get(meta.id)

    if (group === undefined) {
      group = { id: meta.id, entries: [], net: 0, corrects: new Set() }
      groups.set(meta.id, group)
      // Reserve this position now: the group renders where its newest member
      // was, and later members join it in place rather than moving it down.
      rows.push({ kind: 'correction', id: meta.id, entries: group.entries, net: 0, corrects: [] })
    }

    group.entries.push(entry)
    // Direction comes from `entry_type` via the same helper the amount column
    // renders with. Summing raw amounts would make a +30 DEBIT and a +30 GRANT
    // agree when they point opposite ways, and would count a HOLD and its
    // RELEASE as ±credits when neither moves `balance_total`.
    group.net += signedEffect(entry)

    for (const seq of [meta.reversesSeq, meta.replacesSeq]) {
      if (seq !== null) {
        group.corrects.add(seq)
        correctedSeqs.add(seq)
      }
    }
  }

  // `entries` is shared by reference with the accumulator and filled in place;
  // `net` and `corrects` are settled only now that every member has been seen.
  for (const row of rows) {
    if (row.kind !== 'correction') continue

    const group = groups.get(row.id)

    if (group === undefined) continue

    row.net = group.net
    row.corrects = [...group.corrects].sort((a, b) => a - b)
  }

  return { rows, correctedSeqs }
}
