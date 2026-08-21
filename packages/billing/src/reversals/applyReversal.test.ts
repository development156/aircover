import { describe, expect, it } from 'vitest'
import {
  chargebackKey,
  refundKey,
  ReversalOutcomeSchema,
  type ApplyLedgerInput,
} from '@sahoda/shared'
import { createApplyReversal } from './applyReversal'
import type { LedgerApplyResult, LedgerBalance, LedgerPort } from '../ledger/port'

const WS = '00000000-0000-4000-8000-000000000001'

/**
 * The EXACT message real Postgres produces when a compensating entry would take the balance
 * below zero. Captured from `apply_ledger_entry` running under PGlite against the real
 * migration — see `packages/db/tests/ledger_reversal.pglite.test.ts`, which asserts this
 * same wording still comes out. `isBalanceFloorViolation` matches on the constraint NAME
 * inside it, so if Postgres ever rewords the sentence, that test fails before this one
 * silently starts treating a floor violation as an unrelated bug.
 */
const FLOOR_VIOLATION =
  'new row for relation "credit_balances" violates check constraint "balance_held_le_total"'

/**
 * A ledger fake that ENFORCES the same floor the real function does.
 *
 * A fake that just records calls would let every test here pass against an implementation
 * that ignores the constraint entirely — which is the exact bug this module exists to
 * prevent. So this one keeps a balance and throws the real message.
 */
function fakeLedger(initial: { total: number; held: number }) {
  const state = { ...initial }
  const calls: ApplyLedgerInput[] = []
  const applied = new Map<string, LedgerApplyResult>()
  /** Balance changes injected between the read and the write, to simulate a concurrent DEBIT. */
  let shrinkQueue: number[] = []
  let entrySeq = 0

  const port: LedgerPort = {
    async balance(): Promise<LedgerBalance> {
      return { total: state.total, held: state.held }
    },
    async apply(input: ApplyLedgerInput): Promise<LedgerApplyResult> {
      calls.push(input)

      const shrink = shrinkQueue.shift()
      if (shrink !== undefined) state.total -= shrink

      const existing = applied.get(input.idempotencyKey)
      if (existing) return { entry: existing.entry, replayed: true }

      const nextTotal = state.total + input.amount
      if (nextTotal < 0 || state.held > nextTotal) throw new Error(FLOOR_VIOLATION)

      state.total = nextTotal
      entrySeq += 1
      const result: LedgerApplyResult = {
        entry: {
          id: `entry-${entrySeq}`,
          balanceAfter: nextTotal - state.held,
          // signed as the row stores it, so a replay can report what was recorded
          amount: input.amount,
        },
        replayed: false,
      }
      applied.set(input.idempotencyKey, result)
      return result
    },
    async latestHold() {
      return null
    },
  }

  return {
    port,
    calls,
    state,
    queueShrink(...amounts: number[]) {
      shrinkQueue = amounts
    },
  }
}

const reversal = (ledger: LedgerPort) => createApplyReversal({ ledger })

describe('applyReversal — the ordinary case', () => {
  it('reverses the whole amount when the credits are still there', async () => {
    const fake = fakeLedger({ total: 1500, held: 0 })
    const res = await reversal(fake.port)({
      workspaceId: WS,
      kind: 'chargeback',
      reference: 'dispute-1',
      credits: 1500,
      actor: 'provider:cashfree',
    })

    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.data).toMatchObject({
      requestedCredits: 1500,
      reversedCredits: 1500,
      shortfallCredits: 0,
      replayed: false,
      attempts: 1,
    })
    expect(ReversalOutcomeSchema.parse(res.data)).toEqual(res.data)
    expect(fake.state.total).toBe(0)
  })

  it('writes an ADJUST with a NEGATIVE amount — a new row, never an edit', async () => {
    const fake = fakeLedger({ total: 1500, held: 0 })
    await reversal(fake.port)({
      workspaceId: WS,
      kind: 'chargeback',
      reference: 'dispute-1',
      credits: 1500,
      actor: 'provider:cashfree',
    })
    expect(fake.calls[0]).toMatchObject({
      entryType: 'ADJUST',
      amount: -1500,
      idempotencyKey: chargebackKey('dispute-1'),
    })
  })

  it('keys a refund on the refund and a chargeback on the dispute', async () => {
    const fake = fakeLedger({ total: 1500, held: 0 })
    await reversal(fake.port)({
      workspaceId: WS,
      kind: 'refund',
      reference: 'rf-9',
      credits: 100,
      actor: 'admin:u1',
    })
    expect(fake.calls[0]?.idempotencyKey).toBe(refundKey('rf-9'))
    expect(refundKey('rf-9')).not.toBe(chargebackKey('rf-9'))
  })

  it('replays instead of reversing twice when the same dispute arrives again', async () => {
    const fake = fakeLedger({ total: 1500, held: 0 })
    const apply = reversal(fake.port)
    const input = {
      workspaceId: WS,
      kind: 'chargeback' as const,
      reference: 'dispute-1',
      credits: 1000,
      actor: 'provider:cashfree',
    }
    const first = await apply(input)
    const second = await apply(input)

    expect(first.ok && first.data.replayed).toBe(false)
    expect(second.ok && second.data.replayed).toBe(true)
    // The balance moved once, not twice.
    expect(fake.state.total).toBe(500)
  })
})

describe('applyReversal — when the credits have already been spent', () => {
  /**
   * The case the whole module exists for. Without the clamp this is not a partial
   * reversal — it is NO reversal, because the transaction aborts and writes nothing.
   */
  it('clamps to what is left and reports the rest as a shortfall', async () => {
    const fake = fakeLedger({ total: 200, held: 0 })
    const res = await reversal(fake.port)({
      workspaceId: WS,
      kind: 'chargeback',
      reference: 'dispute-2',
      credits: 1500,
      actor: 'provider:cashfree',
    })

    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.data).toMatchObject({
      requestedCredits: 1500,
      reversedCredits: 200,
      shortfallCredits: 1300,
    })
    expect(res.data.reversedCredits + res.data.shortfallCredits).toBe(res.data.requestedCredits)
    expect(fake.state.total).toBe(0)
  })

  it('held credits bound the reversal just as firmly as the total does', async () => {
    // total 1000 with 800 held leaves 200 available. Reversing 1000 would push held above
    // total, which is the constraint that actually fires first.
    const fake = fakeLedger({ total: 1000, held: 800 })
    const res = await reversal(fake.port)({
      workspaceId: WS,
      kind: 'chargeback',
      reference: 'dispute-3',
      credits: 1000,
      actor: 'provider:cashfree',
    })
    expect(res.ok && res.data.reversedCredits).toBe(200)
    expect(res.ok && res.data.shortfallCredits).toBe(800)
  })

  it('records nothing in the ledger when there is nothing left, and still succeeds', async () => {
    const fake = fakeLedger({ total: 0, held: 0 })
    const res = await reversal(fake.port)({
      workspaceId: WS,
      kind: 'chargeback',
      reference: 'dispute-4',
      credits: 1500,
      actor: 'provider:cashfree',
    })

    expect(res.ok).toBe(true)
    if (!res.ok) return
    // A real, correctly-handled dispute. An error here would make it look like an outage.
    expect(res.data).toMatchObject({ reversedCredits: 0, shortfallCredits: 1500, entryId: null })
    expect(fake.calls).toEqual([])
  })

  it('carries the shortfall onto the entry, so the ledger row explains itself', async () => {
    const fake = fakeLedger({ total: 200, held: 0 })
    await reversal(fake.port)({
      workspaceId: WS,
      kind: 'chargeback',
      reference: 'dispute-2',
      credits: 1500,
      actor: 'provider:cashfree',
      meta: { orderId: 'sah_123' },
    })
    expect(fake.calls[0]?.meta).toMatchObject({
      kind: 'chargeback',
      reference: 'dispute-2',
      requestedCredits: 1500,
      reversedCredits: 200,
      shortfallCredits: 1300,
      orderId: 'sah_123',
    })
  })
})

describe('applyReversal — when the balance moves underneath it', () => {
  it('re-clamps and succeeds after a concurrent debit', async () => {
    // Reads 500 available, then a DEBIT of 400 lands before the write. The first ADJUST
    // aborts; the retry reads 100 and reverses that.
    const fake = fakeLedger({ total: 500, held: 0 })
    fake.queueShrink(400)

    const res = await reversal(fake.port)({
      workspaceId: WS,
      kind: 'chargeback',
      reference: 'dispute-5',
      credits: 500,
      actor: 'provider:cashfree',
    })

    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.data).toMatchObject({ reversedCredits: 100, shortfallCredits: 400, attempts: 2 })
    expect(fake.state.total).toBe(0)
  })

  it('gives up with an error rather than reporting a zero reversal it did not make', async () => {
    // "we could not record it" and "there was nothing to take back" are different facts,
    // and only one of them means somebody has to look.
    const fake = fakeLedger({ total: 1000, held: 0 })
    fake.queueShrink(1, 1, 1, 1, 1, 1)

    let seen: unknown = null
    const res = await createApplyReversal({
      ledger: {
        ...fake.port,
        async apply() {
          throw new Error(FLOOR_VIOLATION)
        },
      },
      onError: (cause) => {
        seen = cause
      },
    })({
      workspaceId: WS,
      kind: 'chargeback',
      reference: 'dispute-6',
      credits: 1000,
      actor: 'provider:cashfree',
    })

    expect(res.ok).toBe(false)
    if (res.ok) return
    expect(res.error.code).toBe('PROVIDER_ERROR')
    expect(res.error.message).toBe('Could not record the reversal')
    // The raw cause reaches the observability hook and NEVER the Result.
    expect(seen).toBeInstanceOf(Error)
    expect(JSON.stringify(res.error)).not.toContain('balance_held_le_total')
  })

  it('does NOT retry an error that is not a balance floor violation', async () => {
    // Retrying a genuine bug three times and then calling it a shortfall would turn a
    // defect into a silent, wrong money figure.
    let calls = 0
    const res = await createApplyReversal({
      ledger: {
        async balance() {
          return { total: 1000, held: 0 }
        },
        async apply() {
          calls += 1
          throw new Error('connection terminated unexpectedly')
        },
        async latestHold() {
          return null
        },
      },
    })({
      workspaceId: WS,
      kind: 'chargeback',
      reference: 'dispute-7',
      credits: 100,
      actor: 'provider:cashfree',
    })

    expect(res.ok).toBe(false)
    expect(calls).toBe(1)
  })

  it('reports a failure to READ the balance rather than reversing a guessed amount', async () => {
    const res = await createApplyReversal({
      ledger: {
        async balance(): Promise<never> {
          throw new Error('pool exhausted')
        },
        async apply(): Promise<never> {
          throw new Error('should not be reached')
        },
        async latestHold() {
          return null
        },
      },
    })({
      workspaceId: WS,
      kind: 'chargeback',
      reference: 'dispute-8',
      credits: 100,
      actor: 'provider:cashfree',
    })
    expect(res.ok).toBe(false)
  })
})

describe('applyReversal — what it refuses', () => {
  it('refuses a negative or fractional credit amount', async () => {
    const fake = fakeLedger({ total: 1000, held: 0 })
    for (const credits of [-1, 1.5, Number.NaN]) {
      const res = await reversal(fake.port)({
        workspaceId: WS,
        kind: 'chargeback',
        reference: 'dispute-9',
        credits,
        actor: 'provider:cashfree',
      })
      expect(res.ok).toBe(false)
      if (res.ok) continue
      expect(res.error.code).toBe('VALIDATION_ERROR')
    }
    expect(fake.calls).toEqual([])
  })

  it('handles a zero-credit dispute without writing a zero ADJUST the ledger would reject', async () => {
    // apply_ledger_entry raises INVALID_AMOUNT on a zero ADJUST, so this must never reach it.
    const fake = fakeLedger({ total: 1000, held: 0 })
    const res = await reversal(fake.port)({
      workspaceId: WS,
      kind: 'chargeback',
      reference: 'dispute-10',
      credits: 0,
      actor: 'provider:cashfree',
    })
    expect(res.ok && res.data.reversedCredits).toBe(0)
    expect(fake.calls).toEqual([])
  })
})

/**
 * WHAT A REPLAYED REVERSAL REPORTS.
 *
 * `applyReversal` is documented as safe to retry with a DIFFERENT amount under the
 * SAME idempotency key. That is true of the LEDGER — `app.apply_ledger_entry`
 * returns the original row untouched with `replayed: true`. It was not true of the
 * OUTCOME: the returned `reversedCredits` was recomputed from the balance as it
 * stands now, while `entryId` pointed at the entry that actually exists. The two
 * described different reversals.
 *
 * That matters because `shortfallCredits` is what a credit note bills as a
 * receivable (ReversalOutcome, lifecycle.ts). Reporting a larger shortfall than the
 * ledger recorded bills the customer for money that was already taken back.
 *
 * The replay here is the ordinary shape, not a contrived one: an acknowledgement is
 * lost, the provider re-delivers the same dispute, and the balance has moved in
 * between because the first reversal itself moved it.
 */
describe('applyReversal — a replayed reversal reports what the ledger holds', () => {
  it('reports the original entry’s amount, not a figure recomputed from the new balance', async () => {
    const fake = fakeLedger({ total: 1500, held: 0 })
    const apply = reversal(fake.port)
    const input = {
      workspaceId: WS,
      kind: 'chargeback' as const,
      reference: 'dispute-replay',
      credits: 1000,
      actor: 'provider:cashfree',
    }

    const first = await apply(input)
    expect(first.ok && first.data.reversedCredits).toBe(1000)
    expect(first.ok && first.data.shortfallCredits).toBe(0)
    expect(fake.state.total).toBe(500)

    // The same dispute arrives again. Only 500 is available now — but the ledger
    // still holds the original 1000 ADJUST, and that is the fact to report.
    const second = await apply(input)
    expect(second.ok && second.data.replayed).toBe(true)
    expect(second.ok && second.data.reversedCredits).toBe(1000)
    expect(second.ok && second.data.shortfallCredits).toBe(0)
    // The identity the caller is handed must describe the same entry as the figures.
    expect(second.ok && second.data.entryId).toBe(first.ok ? first.data.entryId : 'x')
    // And the balance moved exactly once.
    expect(fake.state.total).toBe(500)
  })

  it('still reports the shortfall honestly when the ledger genuinely could not take it all', async () => {
    // Nothing replays here: one call, a balance too small to cover the dispute.
    const fake = fakeLedger({ total: 300, held: 0 })
    const out = await reversal(fake.port)({
      workspaceId: WS,
      kind: 'chargeback' as const,
      reference: 'dispute-short',
      credits: 1000,
      actor: 'provider:cashfree',
    })
    expect(out.ok && out.data.reversedCredits).toBe(300)
    expect(out.ok && out.data.shortfallCredits).toBe(700)
    expect(fake.state.total).toBe(0)
  })
})
