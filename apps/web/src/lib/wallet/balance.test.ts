import { describe, expect, test } from 'vitest'
import { staleHoldNote, toBalance } from './balance'

const row = (balance_total: number, balance_held: number): unknown => ({
  workspace_id: '00000000-0000-4000-8000-000000000001',
  balance_total,
  balance_held,
  updated_at: '2026-07-19T10:00:00.000Z',
})

const NOW = new Date('2026-07-19T12:00:00.000Z')

describe('toBalance', () => {
  test('reads a workspace with no credit_balances row as zero, not as an error', () => {
    expect(toBalance(null)).toEqual({
      total: 0,
      held: 0,
      available: 0,
      hasHold: false,
      heldNote: null,
    })
  })

  test('reads an undefined row as zero, because the row is created lazily by the ledger', () => {
    expect(toBalance(undefined)).toEqual({
      total: 0,
      held: 0,
      available: 0,
      hasHold: false,
      heldNote: null,
    })
  })

  test('reports no hold and no note when nothing is held', () => {
    const balance = toBalance(row(500, 0))

    expect(balance.total).toBe(500)
    expect(balance.held).toBe(0)
    expect(balance.available).toBe(500)
    expect(balance.hasHold).toBe(false)
    expect(balance.heldNote).toBeNull()
  })

  test('makes available the spendable number when credits are held', () => {
    const balance = toBalance(row(100, 40))

    expect(balance.available).toBe(60)
    expect(balance.hasHold).toBe(true)
    expect(balance.heldNote).not.toBeNull()
  })

  test('never lets the hero equal the total while a hold is open', () => {
    const balance = toBalance(row(100, 40))

    // The hero renders `available`. Rendering `total` here would tell the user
    // they can spend 100 credits when only 60 are actually spendable.
    expect(balance.available).not.toBe(balance.total)
    expect(balance.available).toBeLessThan(balance.total)
  })

  test('names the held amount in the held note', () => {
    const balance = toBalance(row(100, 40))

    expect(balance.heldNote).toMatch(/40/)
    expect(balance.heldNote).toMatch(/held/i)
  })

  test('says held credits come back when the action finishes or fails', () => {
    // Users never pay for failures, so the note must not read as a deduction.
    expect(toBalance(row(100, 40)).heldNote).toMatch(/releas/i)
    expect(toBalance(row(100, 40)).heldNote).toMatch(/fail/i)
  })

  test('writes the held note in the singular for exactly one credit', () => {
    expect(toBalance(row(10, 1)).heldNote).toMatch(/\b1 credit held\b/i)
  })

  test('groups large held amounts so the note stays readable', () => {
    expect(toBalance(row(20000, 12500)).heldNote).toMatch(/12,500/)
  })

  test('reads junk of the wrong shape as zero without throwing', () => {
    for (const junk of ['nope', 42, [], {}, { error: 'permission denied' }]) {
      expect(() => toBalance(junk)).not.toThrow()
      expect(toBalance(junk).available).toBe(0)
      expect(toBalance(junk).heldNote).toBeNull()
    }
  })

  test('reads a row with non-numeric columns as zero rather than NaN', () => {
    const balance = toBalance({
      workspace_id: '00000000-0000-4000-8000-000000000001',
      balance_total: '500',
      balance_held: null,
      updated_at: '2026-07-19T10:00:00.000Z',
    })

    expect(balance.total).toBe(0)
    expect(balance.available).toBe(0)
    expect(Number.isNaN(balance.available)).toBe(false)
  })

  test('never shows a negative hero when a malformed row holds more than it has', () => {
    // The DB CHECK is balance_held <= balance_total, so this cannot happen in
    // valid data — but a hero of "-150 credits" must never reach a user.
    const balance = toBalance(row(50, 200))

    expect(balance.available).toBe(0)
    expect(balance.available).toBeGreaterThanOrEqual(0)
  })

  test('never shows a negative hero for negative column values', () => {
    const balance = toBalance(row(-100, -20))

    expect(balance.total).toBeGreaterThanOrEqual(0)
    expect(balance.held).toBeGreaterThanOrEqual(0)
    expect(balance.available).toBeGreaterThanOrEqual(0)
  })

  test('never leaks row internals into the held note', () => {
    const note = toBalance(row(100, 40)).heldNote ?? ''

    expect(note).not.toMatch(/balance_held|balance_total|workspace_id|credit_balances/i)
    expect(note).not.toMatch(/select|null|undefined|idempotency/i)
  })

  test('returns a fresh object each call, so one caller cannot poison another read', () => {
    // A shared zero singleton would let any caller that writes to its result
    // corrupt every later zero read in the process — a fabricated hero number.
    const first = toBalance(null)
    const second = toBalance(null)

    expect(first).not.toBe(second)
    expect(second).toEqual({
      total: 0,
      held: 0,
      available: 0,
      hasHold: false,
      heldNote: null,
    })
  })

  test('does not mutate the row it was given', () => {
    const source = row(100, 40)
    const before = JSON.stringify(source)

    toBalance(source)

    expect(JSON.stringify(source)).toBe(before)
  })
})

describe('staleHoldNote', () => {
  test('returns null when there are no open holds', () => {
    expect(staleHoldNote([], NOW)).toBeNull()
  })

  test('returns null when every open hold is still within its expiry', () => {
    expect(staleHoldNote([{ hold_expires_at: '2026-07-19T12:30:00.000Z' }], NOW)).toBeNull()
  })

  test('flags an open hold whose expiry has already passed', () => {
    const note = staleHoldNote([{ hold_expires_at: '2026-07-19T11:00:00.000Z' }], NOW)

    expect(note).toMatch(/expir/i)
    expect(note).toMatch(/stalled/i)
  })

  test('says the stalled credits come back rather than presenting the hold as normal', () => {
    const note = staleHoldNote([{ hold_expires_at: '2026-07-19T11:00:00.000Z' }], NOW)

    expect(note).toMatch(/releas/i)
  })

  test('counts only the expired holds when some are still fresh', () => {
    const note = staleHoldNote(
      [
        { hold_expires_at: '2026-07-19T11:00:00.000Z' },
        { hold_expires_at: '2026-07-19T11:30:00.000Z' },
        { hold_expires_at: '2026-07-19T23:00:00.000Z' },
      ],
      NOW,
    )

    expect(note).toMatch(/\b2 holds\b/i)
  })

  test('writes the stale note in the singular for exactly one expired hold', () => {
    const note = staleHoldNote([{ hold_expires_at: '2026-07-19T11:00:00.000Z' }], NOW)

    expect(note).toMatch(/\b1 hold\b/i)
  })

  test('treats a hold with no expiry as not stale, since nothing has passed', () => {
    expect(staleHoldNote([{ hold_expires_at: null }], NOW)).toBeNull()
  })

  test('treats an unparseable expiry as not stale rather than crying wolf', () => {
    expect(staleHoldNote([{ hold_expires_at: 'not-a-date' }], NOW)).toBeNull()
  })

  test('treats a hold expiring exactly now as not yet stale', () => {
    expect(staleHoldNote([{ hold_expires_at: NOW.toISOString() }], NOW)).toBeNull()
  })

  test('depends only on the now it is given, never on the wall clock', () => {
    const holds = [{ hold_expires_at: '2026-07-19T11:00:00.000Z' }]

    expect(staleHoldNote(holds, new Date('2026-07-19T10:00:00.000Z'))).toBeNull()
    expect(staleHoldNote(holds, new Date('2026-07-19T11:00:00.001Z'))).not.toBeNull()
  })

  test('never leaks row internals into the stale note', () => {
    const note = staleHoldNote([{ hold_expires_at: '2026-07-19T11:00:00.000Z' }], NOW) ?? ''

    expect(note).not.toMatch(/hold_expires_at|credit_ledger|idempotency|select/i)
    expect(note).not.toMatch(/2026-07-19T11:00:00/)
  })

  test('does not mutate the holds array it was given', () => {
    const holds = [
      { hold_expires_at: '2026-07-19T23:00:00.000Z' },
      { hold_expires_at: '2026-07-19T11:00:00.000Z' },
    ]
    const before = JSON.stringify(holds)

    staleHoldNote(holds, NOW)

    expect(JSON.stringify(holds)).toBe(before)
  })

  test('does not promise a release that nothing in the system performs', () => {
    // Pinned limitation: no expired-hold reaper exists anywhere — nothing reads
    // hold_expires_at to settle a stalled hold. This module reports the stall,
    // it does not resolve it, so the copy must not imply an automatic release.
    // If a reaper lands, this test fails and forces a rewrite of the copy.
    const note = staleHoldNote([{ hold_expires_at: '2026-07-19T11:00:00.000Z' }], NOW) ?? ''

    expect(note).toMatch(/not released automatically/i)
    expect(note).not.toMatch(/will be released|released shortly|released soon/i)
  })
})
