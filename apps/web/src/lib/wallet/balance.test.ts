import { describe, expect, test } from 'vitest'
import { holdReaperFromEnv, staleHoldNote, toBalance } from './balance'

/**
 * The reaper state most of these cases run under.
 *
 * Named rather than inlined because it is now an INPUT to the sentence, and the
 * old file had no way to say which world it was describing — it simply asserted
 * one of them.
 */
const OFF = 'not-running' as const
const ON = 'running' as const

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
    expect(staleHoldNote([], NOW, OFF)).toBeNull()
  })

  test('returns null when every open hold is still within its expiry', () => {
    expect(staleHoldNote([{ hold_expires_at: '2026-07-19T12:30:00.000Z' }], NOW, OFF)).toBeNull()
  })

  test('flags an open hold whose expiry has already passed', () => {
    const note = staleHoldNote([{ hold_expires_at: '2026-07-19T11:00:00.000Z' }], NOW, OFF)

    expect(note).toMatch(/expir/i)
    expect(note).toMatch(/stalled/i)
  })

  test('names the release as the thing that is NOT happening, when it is not', () => {
    const note = staleHoldNote([{ hold_expires_at: '2026-07-19T11:00:00.000Z' }], NOW, OFF)

    // This assertion used to be a bare /releas/i under the title "says the
    // stalled credits come back" — which the string "not released
    // automatically" satisfies. A substring that matches its own negation is
    // not a test of the claim. Anchored now.
    expect(note).toMatch(/not released automatically/i)
  })

  test('counts only the expired holds when some are still fresh', () => {
    const note = staleHoldNote(
      [
        { hold_expires_at: '2026-07-19T11:00:00.000Z' },
        { hold_expires_at: '2026-07-19T11:30:00.000Z' },
        { hold_expires_at: '2026-07-19T23:00:00.000Z' },
      ],
      NOW,
      OFF,
    )

    expect(note).toMatch(/\b2 holds\b/i)
  })

  test('writes the stale note in the singular for exactly one expired hold', () => {
    const note = staleHoldNote([{ hold_expires_at: '2026-07-19T11:00:00.000Z' }], NOW, OFF)

    expect(note).toMatch(/\b1 hold\b/i)
  })

  test('treats a hold with no expiry as not stale, since nothing has passed', () => {
    expect(staleHoldNote([{ hold_expires_at: null }], NOW, OFF)).toBeNull()
  })

  test('treats an unparseable expiry as not stale rather than crying wolf', () => {
    expect(staleHoldNote([{ hold_expires_at: 'not-a-date' }], NOW, OFF)).toBeNull()
  })

  test('treats a hold expiring exactly now as not yet stale', () => {
    expect(staleHoldNote([{ hold_expires_at: NOW.toISOString() }], NOW, OFF)).toBeNull()
  })

  test('depends only on the now it is given, never on the wall clock', () => {
    const holds = [{ hold_expires_at: '2026-07-19T11:00:00.000Z' }]

    expect(staleHoldNote(holds, new Date('2026-07-19T10:00:00.000Z'), OFF)).toBeNull()
    expect(staleHoldNote(holds, new Date('2026-07-19T11:00:00.001Z'), OFF)).not.toBeNull()
  })

  test('never leaks row internals into the stale note', () => {
    const note = staleHoldNote([{ hold_expires_at: '2026-07-19T11:00:00.000Z' }], NOW, OFF) ?? ''

    expect(note).not.toMatch(/hold_expires_at|credit_ledger|idempotency|select/i)
    expect(note).not.toMatch(/2026-07-19T11:00:00/)
  })

  test('does not mutate the holds array it was given', () => {
    const holds = [
      { hold_expires_at: '2026-07-19T23:00:00.000Z' },
      { hold_expires_at: '2026-07-19T11:00:00.000Z' },
    ]
    const before = JSON.stringify(holds)

    staleHoldNote(holds, NOW, OFF)

    expect(JSON.stringify(holds)).toBe(before)
  })

  test('does not promise a release that nothing in the system performs', () => {
    // Only when the reaper really is off. The comment that used to sit here read
    // "no expired-hold reaper exists anywhere … if a reaper lands, this test
    // fails and forces a rewrite of the copy". A reaper DID land — apps/jobs
    // holds/sweep.ts, scheduled by vercel.json and called at
    // api/cron/sweeps/route.ts:177 — and this test did not fail, because it
    // watched the copy rather than the reaper. That is the seam;
    // `wallet-reaper-seam.test.ts` is the test that reads the other side.
    const note = staleHoldNote([{ hold_expires_at: '2026-07-19T11:00:00.000Z' }], NOW, OFF) ?? ''

    expect(note).toMatch(/not released automatically/i)
    expect(note).not.toMatch(/will be released|released shortly|released soon/i)
  })

  test('says the credits come back when the reaper IS running', () => {
    const note = staleHoldNote([{ hold_expires_at: '2026-07-19T11:00:00.000Z' }], NOW, ON) ?? ''

    // The opposite world, and the one the deployed cron already reaches the
    // moment SAHODA_HOLD_SWEEP_MODE is set. Telling a customer their money is
    // stuck when it returns in five minutes is the same class of lie as the
    // reverse, just kinder-sounding.
    expect(note).not.toMatch(/not released automatically/i)
    expect(note).toMatch(/every few minutes/i)
  })

  test('the two worlds are different sentences', () => {
    const holds = [{ hold_expires_at: '2026-07-19T11:00:00.000Z' }]

    expect(staleHoldNote(holds, NOW, ON)).not.toEqual(staleHoldNote(holds, NOW, OFF))
  })

  test('both worlds still count and pluralise from the same rows', () => {
    const two = [
      { hold_expires_at: '2026-07-19T11:00:00.000Z' },
      { hold_expires_at: '2026-07-19T11:30:00.000Z' },
    ]

    for (const reaper of [ON, OFF]) {
      expect(staleHoldNote(two, NOW, reaper)).toMatch(/\b2 holds have\b/)
      expect(staleHoldNote([two[0]!], NOW, reaper)).toMatch(/\b1 hold has\b/)
    }
  })
})

describe('holdReaperFromEnv', () => {
  test('only the literal "on" means the reaper moves credits', () => {
    expect(holdReaperFromEnv('on')).toBe('running')
  })

  test.each([undefined, '', 'off', 'report', 'ON', 'true', '1'])('%o is not running', (value) => {
    // `report` LISTS what it would release and writes nothing, and an unset
    // variable is `off` — the same default apps/jobs/src/env.ts readMode
    // applies. Anything this does not recognise is treated as off, because
    // claiming an automatic release we cannot deliver is the worse error.
    expect(holdReaperFromEnv(value)).toBe('not-running')
  })
})
