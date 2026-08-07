import type { LedgerEntry } from '@sahoda/shared'
import { describe, expect, test } from 'vitest'

import { isOpenHold, settledHoldIds } from './hold-settlement'

/**
 * "Reserved" must mean credits that are frozen RIGHT NOW.
 *
 * The wallet used to derive it as `entry_type === 'HOLD'`, which is "is a hold",
 * not "is an OPEN hold". A HOLD keeps its row forever — the ledger is
 * append-only — so every completed charge rendered two rows: `Reserved −3`
 * followed by `−3`. The account owner was told credits were frozen at that
 * moment when in truth they had been charged and the hold closed, possibly
 * months earlier. The money was right; the claim about it was false.
 *
 * Openness is the ABSENCE of a settling entry. `settles_entry_id` is unique on
 * `credit_ledger`, so at most one entry ever settles a given hold, and it may be
 * either a DEBIT (the work succeeded and the credits were charged) or a RELEASE
 * (it failed, or the reaper swept an expired hold, and the credits went back).
 * Both close the hold. Only the reason differs.
 */

const HOLD_ID = '11111111-1111-4111-8111-111111111111'
const OTHER_HOLD_ID = '22222222-2222-4222-8222-222222222222'

function entry(over: Partial<LedgerEntry> = {}): LedgerEntry {
  return {
    id: '99999999-9999-4999-8999-999999999999',
    workspace_id: '33333333-3333-4333-8333-333333333333',
    seq: 100,
    entry_type: 'HOLD',
    amount: 3,
    balance_after: 97,
    action_type: 'content_variants',
    object_ref: null,
    model_tier: null,
    cogs_usd_est: null,
    idempotency_key: 'k',
    settles_entry_id: null,
    hold_expires_at: null,
    actor: null,
    meta: null,
    created_at: '2026-07-27T09:00:00.000Z',
    ...over,
  } as LedgerEntry
}

const hold = (id: string, seq: number) => entry({ id, seq, entry_type: 'HOLD' })

describe('settledHoldIds reads settlement off the page', () => {
  test('a DEBIT settles its hold', () => {
    const entries = [
      entry({ id: 'd', seq: 101, entry_type: 'DEBIT', settles_entry_id: HOLD_ID }),
      hold(HOLD_ID, 100),
    ]

    expect(settledHoldIds(entries).has(HOLD_ID)).toBe(true)
  })

  test('a RELEASE settles its hold too — the credits came back, but the hold is closed', () => {
    const entries = [
      entry({ id: 'r', seq: 101, entry_type: 'RELEASE', settles_entry_id: HOLD_ID }),
      hold(HOLD_ID, 100),
    ]

    expect(settledHoldIds(entries).has(HOLD_ID)).toBe(true)
  })

  test('an unsettled hold is absent from the set', () => {
    expect(settledHoldIds([hold(HOLD_ID, 100)]).has(HOLD_ID)).toBe(false)
  })

  test('one hold settling does not settle another', () => {
    const entries = [
      entry({ id: 'd', seq: 102, entry_type: 'DEBIT', settles_entry_id: HOLD_ID }),
      hold(OTHER_HOLD_ID, 101),
      hold(HOLD_ID, 100),
    ]
    const settled = settledHoldIds(entries)

    expect(settled.has(HOLD_ID)).toBe(true)
    expect(settled.has(OTHER_HOLD_ID)).toBe(false)
  })

  test('a non-string settles_entry_id is ignored rather than coerced', () => {
    // `meta`/jsonb-adjacent columns arrive from PostgREST untyped; a coerced
    // value here would mark an arbitrary hold as closed.
    const entries = [entry({ id: 'd', seq: 101, settles_entry_id: 0 as unknown as string })]

    expect(settledHoldIds(entries).size).toBe(0)
  })
})

describe('isOpenHold', () => {
  test('a settled hold is NOT open — this is the row that was lying', () => {
    const settled = new Set([HOLD_ID])

    expect(isOpenHold(hold(HOLD_ID, 100), settled)).toBe(false)
  })

  test('an unsettled hold IS open', () => {
    expect(isOpenHold(hold(HOLD_ID, 100), new Set())).toBe(true)
  })

  test('a hold settled by a RELEASE is not open', () => {
    const entries = [
      entry({ id: 'r', seq: 101, entry_type: 'RELEASE', settles_entry_id: HOLD_ID }),
      hold(HOLD_ID, 100),
    ]

    expect(isOpenHold(hold(HOLD_ID, 100), settledHoldIds(entries))).toBe(false)
  })

  test('only a HOLD can be open — no other type is ever "reserved"', () => {
    for (const type of ['DEBIT', 'RELEASE', 'GRANT', 'TOPUP', 'ADJUST', 'EXPIRE'] as const) {
      expect(isOpenHold(entry({ entry_type: type }), new Set()), type).toBe(false)
    }
  })

  test('a hold expiry timestamp is not evidence of openness', () => {
    // `hold_expires_at` survives settlement, which is exactly why the column
    // cannot be used as the signal — it would report every past charge as stuck.
    const settled = new Set([HOLD_ID])
    const expired = entry({ id: HOLD_ID, hold_expires_at: '2026-07-01T00:00:00.000Z' })

    expect(isOpenHold(expired, settled)).toBe(false)
  })
})

describe('the page window cannot produce a false "Reserved"', () => {
  test('a hold visible on the page always has its settlement on the same page', () => {
    // WHY THE DERIVATION IS SAFE. `seq` is a monotonic identity and a settling
    // entry is always written AFTER the hold it settles, so settlement.seq >
    // hold.seq. The wallet reads the top N by `seq DESC`, so the page is a
    // suffix of the sequence with no gaps at the top: if a hold is on the page,
    // every entry newer than it is on the page too — including its settlement.
    //
    // The dangerous direction would be a settled hold whose settlement fell off
    // the window, which would render "Reserved" on closed credits. That cannot
    // happen. The reverse (a settlement on the page whose hold has scrolled
    // away) is harmless: the hold is not rendered, so nothing claims anything.
    const page = [
      entry({ id: 'newest', seq: 300, entry_type: 'DEBIT', settles_entry_id: HOLD_ID }),
      hold(HOLD_ID, 299),
      entry({ id: 'older', seq: 298, entry_type: 'GRANT' }),
    ]
    const settled = settledHoldIds(page)

    expect(isOpenHold(hold(HOLD_ID, 299), settled)).toBe(false)
  })

  test('a settlement whose hold has scrolled off the page claims nothing', () => {
    const page = [entry({ id: 'd', seq: 500, entry_type: 'DEBIT', settles_entry_id: HOLD_ID })]

    // The set records it, but no hold row exists to mark — no crash, no claim.
    expect(settledHoldIds(page).has(HOLD_ID)).toBe(true)
    expect(page.filter((e) => e.entry_type === 'HOLD')).toHaveLength(0)
  })
})
