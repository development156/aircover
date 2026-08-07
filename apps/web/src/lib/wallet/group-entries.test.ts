import { describe, expect, test } from 'vitest'
import type { LedgerEntry } from '@sahoda/shared'

import { groupCorrections } from './group-entries'

/**
 * Ledger corrections, as the user meets them.
 *
 * The real sequence in the dev workspace: seq 5374 was a manual GRANT of 100
 * credits that the wallet mislabelled. Because credit_ledger is append-only, it
 * was fixed by writing two ADJUSTs — seq 5597 reversing it (-100) and seq 5596
 * re-issuing it correctly (+100). Every row is right and the pair nets to zero.
 *
 * Newest-first, that renders as:
 *
 *     -100  Manual adjustment
 *     +100  Manual adjustment
 *     …
 *     +100  Credits added by Sahoda     ← seq 5374, scrolled away
 *
 * Someone checking their credits sees 100 taken off the top of their history
 * with no explanation attached to it. The money is fine; the story is not.
 * Grouping the pair is what turns three correct rows into the one event they
 * describe.
 */

const WORKSPACE = '22222222-2222-4222-8222-222222222222'
const CORRECTION = '2026-07-25-relabel-manual-grant'

function entry(overrides: Partial<LedgerEntry> = {}): LedgerEntry {
  return {
    id: `id-${overrides.seq ?? 1}`,
    workspace_id: WORKSPACE,
    seq: 1,
    entry_type: 'DEBIT',
    amount: 3,
    balance_after: 88,
    action_type: 'post_variants',
    object_ref: null,
    model_tier: null,
    cogs_usd_est: null,
    idempotency_key: `key-${overrides.seq ?? 1}`,
    settles_entry_id: null,
    hold_expires_at: null,
    actor: 'user_2abcDEF',
    meta: null,
    created_at: '2026-07-25T10:21:45.751Z',
    ...overrides,
  }
}

/** The three rows exactly as stored, newest first. */
const REVERSAL = entry({
  seq: 5597,
  entry_type: 'ADJUST',
  amount: -100,
  action_type: 'manual_adjustment',
  actor: 'claude-ledger-correction',
  meta: { correction: CORRECTION, reverses_seq: 5374 },
})
const REISSUE = entry({
  seq: 5596,
  entry_type: 'ADJUST',
  amount: 100,
  action_type: 'manual_adjustment',
  actor: 'claude-ledger-correction',
  meta: { correction: CORRECTION, replaces_seq: 5374 },
})
const ORIGINAL = entry({
  seq: 5374,
  entry_type: 'GRANT',
  amount: 100,
  action_type: 'signup_grant',
  idempotency_key: 'manual-verify-topup:c12b271a:20260724-1',
  actor: 'claude-verification',
})
const UNRELATED = entry({ seq: 5500, entry_type: 'DEBIT', amount: 26 })

describe('the real three-row correction', () => {
  const grouped = groupCorrections([REVERSAL, REISSUE, UNRELATED, ORIGINAL])

  test('collapses the pair into one row and leaves the others alone', () => {
    expect(grouped.rows.map((row) => row.kind)).toEqual(['correction', 'entry', 'entry'])
  })

  test('keeps both halves inside the group, in the order they were given', () => {
    const [group] = grouped.rows

    expect(group?.kind).toBe('correction')
    expect(group?.kind === 'correction' && group.entries.map((e) => e.seq)).toEqual([5597, 5596])
  })

  test('states the net effect, which is what the user actually needs to know', () => {
    const [group] = grouped.rows

    // Nothing was taken. Without this the pair reads as a 100-credit clawback
    // followed by an unexplained 100-credit gift.
    expect(group?.kind === 'correction' && group.net).toBe(0)
  })

  test('names the entry being corrected, once, from either half', () => {
    const [group] = grouped.rows

    expect(group?.kind === 'correction' && group.corrects).toEqual([5374])
  })

  test('marks the corrected entry so it does not read as still standing', () => {
    expect(grouped.correctedSeqs.has(5374)).toBe(true)
    expect(grouped.correctedSeqs.has(5500)).toBe(false)
  })

  test('holds the group where its newest member was, so the timeline still reads', () => {
    // Newest first is the contract of the whole list. Hoisting corrections to
    // the top, or sinking them, would put them next to entries they have
    // nothing to do with.
    const positions = groupCorrections([UNRELATED, REVERSAL, REISSUE, ORIGINAL])

    expect(positions.rows.map((row) => row.kind)).toEqual(['entry', 'correction', 'entry'])
  })
})

describe('a correction that is not net zero', () => {
  test('reports what it actually moved', () => {
    // A correction that fixes an amount rather than a label does move credits,
    // and the group must say so rather than assuming every correction cancels.
    const grouped = groupCorrections([
      entry({
        seq: 20,
        entry_type: 'ADJUST',
        amount: -100,
        meta: { correction: 'c', reverses_seq: 5 },
      }),
      entry({
        seq: 19,
        entry_type: 'ADJUST',
        amount: 60,
        meta: { correction: 'c', replaces_seq: 5 },
      }),
    ])
    const [group] = grouped.rows

    expect(group?.kind === 'correction' && group.net).toBe(-40)
  })

  test('takes the direction from entry_type, not from the raw amount', () => {
    // A GRANT correction stores a positive amount and a DEBIT correction stores
    // a positive amount too — summing raw amounts would make them agree when
    // they point opposite ways.
    const grouped = groupCorrections([
      entry({ seq: 20, entry_type: 'DEBIT', amount: 30, meta: { correction: 'c' } }),
      entry({ seq: 19, entry_type: 'GRANT', amount: 30, meta: { correction: 'c' } }),
    ])
    const [group] = grouped.rows

    expect(group?.kind === 'correction' && group.net).toBe(0)
  })

  test('counts a hold and its release as moving nothing', () => {
    // Neither touches balance_total; a group summing them as ±credits would
    // invent a movement the wallet never made.
    const grouped = groupCorrections([
      entry({ seq: 20, entry_type: 'HOLD', amount: 5, meta: { correction: 'c' } }),
      entry({ seq: 19, entry_type: 'RELEASE', amount: 5, meta: { correction: 'c' } }),
    ])
    const [group] = grouped.rows

    expect(group?.kind === 'correction' && group.net).toBe(0)
  })
})

describe('corrections that are not tidy pairs', () => {
  test('groups three or more rows under one id', () => {
    const grouped = groupCorrections([
      entry({ seq: 3, entry_type: 'ADJUST', amount: -10, meta: { correction: 'c' } }),
      entry({ seq: 2, entry_type: 'ADJUST', amount: -10, meta: { correction: 'c' } }),
      entry({ seq: 1, entry_type: 'ADJUST', amount: 20, meta: { correction: 'c' } }),
    ])

    expect(grouped.rows).toHaveLength(1)
    expect(grouped.rows[0]?.kind === 'correction' && grouped.rows[0].entries).toHaveLength(3)
  })

  test('still groups a lone half whose partner fell outside the 50-row window', () => {
    // The window is a display cap, not a data boundary. A single labelled row
    // beats an unexplained -100 that the user cannot place.
    const grouped = groupCorrections([REVERSAL, UNRELATED])

    expect(grouped.rows[0]?.kind).toBe('correction')
    expect(grouped.rows[0]?.kind === 'correction' && grouped.rows[0].net).toBe(-100)
  })

  test('keeps two different corrections apart', () => {
    const grouped = groupCorrections([
      entry({ seq: 4, entry_type: 'ADJUST', amount: -10, meta: { correction: 'c-2' } }),
      entry({ seq: 3, entry_type: 'ADJUST', amount: 10, meta: { correction: 'c-2' } }),
      entry({ seq: 2, entry_type: 'ADJUST', amount: -5, meta: { correction: 'c-1' } }),
      entry({ seq: 1, entry_type: 'ADJUST', amount: 5, meta: { correction: 'c-1' } }),
    ])

    expect(grouped.rows.map((row) => row.kind)).toEqual(['correction', 'correction'])
  })

  test('does not merge rows that merely sit next to each other', () => {
    // Two unrelated manual adjustments in a row look exactly like a correction
    // pair on screen. Only the recorded id may group them.
    const grouped = groupCorrections([
      entry({ seq: 2, entry_type: 'ADJUST', amount: -10 }),
      entry({ seq: 1, entry_type: 'ADJUST', amount: 10 }),
    ])

    expect(grouped.rows.map((row) => row.kind)).toEqual(['entry', 'entry'])
  })

  test('never points at a corrected entry that was not named', () => {
    const grouped = groupCorrections([
      entry({ seq: 2, entry_type: 'ADJUST', amount: -10, meta: { correction: 'c' } }),
    ])

    expect(grouped.rows[0]?.kind === 'correction' && grouped.rows[0].corrects).toEqual([])
    expect(grouped.correctedSeqs.size).toBe(0)
  })
})

describe('an ordinary ledger', () => {
  test('passes through untouched when nothing is a correction', () => {
    const entries = [entry({ seq: 3 }), entry({ seq: 2 }), entry({ seq: 1 })]
    const grouped = groupCorrections(entries)

    expect(grouped.rows.map((row) => row.kind === 'entry' && row.entry.seq)).toEqual([3, 2, 1])
    expect(grouped.correctedSeqs.size).toBe(0)
  })

  test('does not mutate the array it was given', () => {
    const entries = [REVERSAL, REISSUE, ORIGINAL]
    const before = [...entries]

    groupCorrections(entries)

    expect(entries).toEqual(before)
  })

  test('handles an empty ledger', () => {
    expect(groupCorrections([])).toEqual({ rows: [], correctedSeqs: new Set() })
  })
})
