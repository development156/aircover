import { describe, it, expect, vi } from 'vitest'
import { creditCost, debitKey, holdKey, releaseKey, type ApplyLedgerInput } from '@sahoda/shared'
import { createWithCredits } from './withCredits'
import type { LedgerApplyResult, LedgerBalance, LedgerPort, LatestHold } from './ledger/port'

/**
 * In-memory LedgerPort that mirrors the balance arithmetic of app.apply_ledger_entry:
 * HOLD moves credits into `held` (balance_after = total − held); DEBIT settling a hold
 * removes the held amount and lowers `total`; RELEASE settling a hold just frees the held
 * amount. Lets the wrapper be tested without a database.
 */
class FakePort implements LedgerPort {
  readonly calls: ApplyLedgerInput[] = []
  latest: LatestHold | null = null
  holdOutcome: 'ok' | 'insufficient' | 'throw' = 'ok'
  releaseOutcome: 'ok' | 'throw' = 'ok'
  debitOutcome: 'ok' | 'throw' = 'ok'
  latestHoldOutcome: 'ok' | 'throw' = 'ok'

  private total: number
  private held = 0
  private seq = 0
  private readonly holdAmounts = new Map<string, number>()

  constructor(total = 100) {
    this.total = total
  }

  async apply(input: ApplyLedgerInput): Promise<LedgerApplyResult> {
    this.calls.push(input)
    const id = `entry-${++this.seq}`
    if (input.entryType === 'HOLD') {
      if (this.holdOutcome === 'insufficient') throw new Error('ledger: CREDIT_INSUFFICIENT')
      if (this.holdOutcome === 'throw') throw new Error('ledger: connection reset')
      this.held += input.amount
      this.holdAmounts.set(id, input.amount)
      return { entry: { id, balanceAfter: this.total - this.held }, replayed: false }
    }
    if (input.entryType === 'DEBIT') {
      if (this.debitOutcome === 'throw') throw new Error('ledger: HOLD_ALREADY_SETTLED')
      this.total -= input.amount
      this.held -= this.holdAmounts.get(input.settlesEntryId ?? '') ?? 0
      return { entry: { id, balanceAfter: this.total }, replayed: false }
    }
    if (input.entryType === 'RELEASE') {
      if (this.releaseOutcome === 'throw') throw new Error('ledger: release write failed')
      this.held -= this.holdAmounts.get(input.settlesEntryId ?? '') ?? 0
      return { entry: { id, balanceAfter: this.total }, replayed: false }
    }
    throw new Error(`FakePort got unexpected entry type ${input.entryType}`)
  }

  async latestHold(): Promise<LatestHold | null> {
    if (this.latestHoldOutcome === 'throw') throw new Error('ledger: latestHold read failed')
    return this.latest
  }

  async balance(): Promise<LedgerBalance> {
    return { total: this.total, held: this.held }
  }

  entryTypes(): string[] {
    return this.calls.map((c) => c.entryType)
  }
  call(type: string): ApplyLedgerInput | undefined {
    return this.calls.find((c) => c.entryType === type)
  }
}

const OPTS = { workspaceId: 'ws-1', action: 'post_variants' as const, objectRef: 'post-42' }
const deps = { newTraceId: () => 'trace-fixed' }

describe('withCredits — success path (HOLD → DEBIT)', () => {
  it('runs fn, DEBITs the exact configured cost, and returns data + balanceAfter', async () => {
    const port = new FakePort(100)
    const withCredits = createWithCredits(port, deps)

    const result = await withCredits(OPTS, async () => 'GENERATED')

    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('expected ok')
    expect(result.data.data).toBe('GENERATED')
    expect(result.data.balanceAfter).toBe(97) // 100 − post_variants(3)
    expect(port.entryTypes()).toEqual(['HOLD', 'DEBIT'])
  })

  it('takes the charge amount ONLY from creditCost(action), never a literal', async () => {
    const port = new FakePort(100)
    const withCredits = createWithCredits(port, deps)
    await withCredits(OPTS, async () => 'x')

    const cost = creditCost('post_variants')
    expect(cost).toBe(3)
    expect(port.call('HOLD')?.amount).toBe(cost)
    expect(port.call('DEBIT')?.amount).toBe(cost)
  })

  it('passes actionType + creditsCharged to fn so it can log provenance', async () => {
    const port = new FakePort(100)
    const withCredits = createWithCredits(port, deps)
    const seen: unknown[] = []
    await withCredits(OPTS, async (ctx) => {
      seen.push(ctx)
      return 1
    })
    expect(seen).toEqual([{ actionType: 'post_variants', creditsCharged: 3 }])
  })

  it('settles the DEBIT against the HOLD with deterministic keys (attempt 1 by default)', async () => {
    const port = new FakePort(100)
    const withCredits = createWithCredits(port, deps)
    await withCredits(OPTS, async () => 'x')

    const hKey = holdKey('post_variants', 'post-42', 1)
    expect(port.call('HOLD')?.idempotencyKey).toBe(hKey)
    expect(port.call('DEBIT')?.idempotencyKey).toBe(debitKey(hKey))
    expect(port.call('DEBIT')?.settlesEntryId).toBe(port.call('HOLD') && 'entry-1')
  })

  it('records action_type + object_ref but leaves model_tier / cogs null on the DEBIT (owner ruling #3)', async () => {
    const port = new FakePort(100)
    const withCredits = createWithCredits(port, deps)
    await withCredits(OPTS, async () => 'x')

    const debit = port.call('DEBIT')!
    expect(debit.actionType).toBe('post_variants')
    expect(debit.objectRef).toBe('post-42')
    expect(debit.modelTier).toBeUndefined()
    expect(debit.cogsUsdEst).toBeUndefined()
  })
})

describe('withCredits — failure path (HOLD → RELEASE), user never pays', () => {
  it('RELEASEs the hold and returns a PROVIDER_ERROR when fn throws — no DEBIT', async () => {
    const port = new FakePort(100)
    const withCredits = createWithCredits(port, deps)

    const result = await withCredits(OPTS, async () => {
      throw new Error('model timed out')
    })

    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('expected err')
    expect(result.error.code).toBe('PROVIDER_ERROR')
    expect(result.error.traceId).toBe('trace-fixed')
    expect(port.entryTypes()).toEqual(['HOLD', 'RELEASE'])
    expect(port.call('RELEASE')?.amount).toBe(3)
    expect(port.call('RELEASE')?.settlesEntryId).toBe('entry-1')
  })

  it('still returns an honest error (never throws) if the RELEASE write itself fails', async () => {
    const port = new FakePort(100)
    port.releaseOutcome = 'throw'
    const withCredits = createWithCredits(port, deps)

    const result = await withCredits(OPTS, async () => {
      throw new Error('model timed out')
    })

    expect(result.ok).toBe(false) // hold TTL is the backstop; caller still gets a clean error
  })
})

describe('withCredits — never rejects (WithCreditsFn Result contract)', () => {
  it('returns an err Result (does not reject) when the settling DEBIT throws after fn succeeded', async () => {
    const port = new FakePort(100)
    port.debitOutcome = 'throw' // e.g. hold TTL-expired / racing RELEASE → HOLD_ALREADY_SETTLED
    const withCredits = createWithCredits(port, deps)

    // Must RESOLVE to an err, not throw — a rejecting promise would violate the contract.
    const result = await withCredits(OPTS, async () => 'generated')

    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('expected err')
    expect(result.error.code).toBe('PROVIDER_ERROR')
    expect(result.error.traceId).toBe('trace-fixed')
    // fn ran (HOLD then the DEBIT attempt); the user is NOT charged (hold TTL releases).
    expect(port.entryTypes()).toEqual(['HOLD', 'DEBIT'])
  })

  it('returns an err Result (does not reject) when the latestHold read throws', async () => {
    const port = new FakePort(100)
    port.latestHoldOutcome = 'throw'
    const withCredits = createWithCredits(port, deps)

    const result = await withCredits(OPTS, async () => 'x')

    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('expected err')
    expect(result.error.code).toBe('PROVIDER_ERROR')
    expect(port.entryTypes()).toEqual([]) // never reached the HOLD
  })

  it('maps a HOLD infrastructure failure (not insufficient) to PROVIDER_ERROR, fn not called', async () => {
    const port = new FakePort(100)
    port.holdOutcome = 'throw'
    const withCredits = createWithCredits(port, deps)
    const fn = vi.fn(async () => 'should-not-run')

    const result = await withCredits(OPTS, fn)

    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('expected err')
    expect(result.error.code).toBe('PROVIDER_ERROR')
    expect(fn).not.toHaveBeenCalled()
  })
})

describe('withCredits — insufficient credits', () => {
  it('returns CREDIT_INSUFFICIENT with exact shortfall and never calls fn', async () => {
    const port = new FakePort(2) // available 2 < site_generate(100)
    port.holdOutcome = 'insufficient'
    const withCredits = createWithCredits(port, deps)
    const fn = vi.fn(async () => 'should-not-run')

    const result = await withCredits(
      { workspaceId: 'ws-1', action: 'site_generate', objectRef: 'site-1' },
      fn,
    )

    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('expected err')
    expect(result.error.code).toBe('CREDIT_INSUFFICIENT')
    expect(result.error.details).toEqual({ available: 2, required: 100 })
    expect(fn).not.toHaveBeenCalled()
    expect(port.entryTypes()).toEqual(['HOLD']) // the HOLD attempt that was rejected; no settle
  })
})

describe('withCredits — attempt derivation (server-side, never caller-supplied)', () => {
  it('uses attempt 1 when there is no prior hold', async () => {
    const port = new FakePort(100)
    const withCredits = createWithCredits(port, deps)
    await withCredits(OPTS, async () => 'x')
    expect(port.call('HOLD')?.idempotencyKey).toBe(holdKey('post_variants', 'post-42', 1))
  })

  it('resumes the same attempt when the latest hold is still unsettled (crash recovery)', async () => {
    const port = new FakePort(100)
    port.latest = { attempt: 2, settledBy: null }
    const withCredits = createWithCredits(port, deps)
    await withCredits(OPTS, async () => 'x')
    expect(port.call('HOLD')?.idempotencyKey).toBe(holdKey('post_variants', 'post-42', 2))
  })

  it('advances to a fresh attempt when the latest hold was settled by a RELEASE (refunded — genuine retry)', async () => {
    const port = new FakePort(100)
    port.latest = { attempt: 2, settledBy: 'release' }
    const withCredits = createWithCredits(port, deps)
    await withCredits(OPTS, async () => 'x')
    expect(port.call('HOLD')?.idempotencyKey).toBe(holdKey('post_variants', 'post-42', 3))
    // and the DEBIT key must hang off the fresh hold key
    const hKey = holdKey('post_variants', 'post-42', 3)
    expect(port.call('DEBIT')?.idempotencyKey).toBe(debitKey(hKey))
  })

  it('REUSES the attempt when the latest hold was settled by a DEBIT (lost-ack retry replays, never re-charges)', async () => {
    const port = new FakePort(100)
    port.latest = { attempt: 2, settledBy: 'debit' }
    const withCredits = createWithCredits(port, deps)
    await withCredits(OPTS, async () => 'x')
    // Attempt 2 is reused (NOT advanced to 3) → on the real ledger the DEBIT replays under the
    // same key rather than charging a second time. Advancing here was the double-charge bug.
    expect(port.call('HOLD')?.idempotencyKey).toBe(holdKey('post_variants', 'post-42', 2))
    expect(port.call('DEBIT')?.idempotencyKey).toBe(
      debitKey(holdKey('post_variants', 'post-42', 2)),
    )
  })
})

describe('withCredits — key builders wire to the shared contract', () => {
  it('release key derives from the hold key', () => {
    const hKey = holdKey('caption_rewrite', 'c1', 1)
    expect(releaseKey(hKey)).toBe('caption_rewrite:c1:1:release')
    expect(debitKey(hKey)).toBe('caption_rewrite:c1:1:debit')
  })
})
