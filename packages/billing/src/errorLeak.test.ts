import { describe, expect, it } from 'vitest'
import type { ApplyLedgerInput } from '@sahoda/shared'
import { createWithCredits } from './withCredits'
import type { LatestHold, LedgerApplyResult, LedgerBalance, LedgerPort } from './ledger/port'
import { createProcessPaymentEvent } from './webhooks/processPaymentEvent'
import type { ParsedWebhookEvent } from './providers/types'

/**
 * Outer catches must return a FIXED message. This is not cosmetic: apps/web puts
 * `credits.error.message` straight into user-facing copy (brand-resolve.ts:174), so any raw
 * internal message — a DB error, a stack-derived string, an internal sentinel — is rendered
 * to the customer. applyPlanGrant already does this correctly ('Could not apply plan grant');
 * these tests hold withCredits and processPaymentEvent to the same standard.
 */

/** A secret-shaped string no user-facing message may ever contain. */
const LEAKY = 'connect ECONNREFUSED 10.0.0.5:5432 password=hunter2'

class ThrowingPort implements LedgerPort {
  constructor(private readonly where: 'latestHold' | 'apply') {}
  async apply(input: ApplyLedgerInput): Promise<LedgerApplyResult> {
    if (this.where === 'apply') throw new Error(LEAKY)
    return { entry: { id: 'h1', balanceAfter: 100, amount: input.amount }, replayed: false }
  }
  async latestHold(): Promise<LatestHold | null> {
    if (this.where === 'latestHold') throw new Error(LEAKY)
    return null
  }
  async balance(): Promise<LedgerBalance> {
    return { total: 100, held: 0 }
  }
}

class OkPort implements LedgerPort {
  async apply(input: ApplyLedgerInput): Promise<LedgerApplyResult> {
    return {
      entry: { id: `e-${input.entryType}`, balanceAfter: 50, amount: input.amount },
      replayed: false,
    }
  }
  async latestHold(): Promise<LatestHold | null> {
    return null
  }
  async balance(): Promise<LedgerBalance> {
    return { total: 100, held: 0 }
  }
}

const opts = { workspaceId: 'ws-1', action: 'brand_research' as const, objectRef: 'obj-1' }

describe('withCredits — no internal detail crosses the Result boundary', () => {
  it('returns a fixed message when the wrapped action throws', async () => {
    const withCredits = createWithCredits(new OkPort(), { newTraceId: () => 't-1' })

    const result = await withCredits(opts, async () => {
      throw new Error(LEAKY)
    })

    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('expected err')
    expect(result.error.code).toBe('PROVIDER_ERROR')
    expect(result.error.message).toBe('Could not complete the action')
    expect(result.error.message).not.toContain('hunter2')
    expect(result.error.message).not.toContain('ECONNREFUSED')
  })

  it('does not leak an internal sentinel thrown by the caller', async () => {
    // The real shape at the only production call site: the action throws 'MESH_ERROR' as a
    // control-flow sentinel and stashes the real outcome elsewhere. That token must not
    // surface as customer-facing copy.
    const withCredits = createWithCredits(new OkPort(), { newTraceId: () => 't-1' })

    const result = await withCredits(opts, async () => {
      throw new Error('MESH_ERROR')
    })

    if (result.ok) throw new Error('expected err')
    expect(result.error.message).not.toContain('MESH_ERROR')
  })

  it('returns a fixed message from the outer backstop', async () => {
    const withCredits = createWithCredits(new ThrowingPort('latestHold'), {
      newTraceId: () => 't-1',
    })

    const result = await withCredits(opts, async () => 'never')

    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('expected err')
    expect(result.error.code).toBe('PROVIDER_ERROR')
    expect(result.error.message).toBe('Could not complete the action')
    expect(result.error.message).not.toContain('hunter2')
  })

  it('still carries the traceId so the failure stays correlatable', async () => {
    const withCredits = createWithCredits(new ThrowingPort('latestHold'), {
      newTraceId: () => 'trace-abc',
    })

    const result = await withCredits(opts, async () => 'never')

    if (result.ok) throw new Error('expected err')
    expect(result.error.traceId).toBe('trace-abc')
  })

  it('hands the raw cause to onError so debuggability is not lost', async () => {
    const seen: Array<{ cause: unknown; traceId: string }> = []
    const withCredits = createWithCredits(new ThrowingPort('latestHold'), {
      newTraceId: () => 'trace-abc',
      onError: (cause, traceId) => seen.push({ cause, traceId }),
    })

    await withCredits(opts, async () => 'never')

    expect(seen).toHaveLength(1)
    expect((seen[0]?.cause as Error).message).toBe(LEAKY)
    expect(seen[0]?.traceId).toBe('trace-abc')
  })

  it('a throwing onError cannot corrupt the returned Result', async () => {
    const withCredits = createWithCredits(new ThrowingPort('latestHold'), {
      newTraceId: () => 't-1',
      onError: () => {
        throw new Error('logger exploded')
      },
    })

    const result = await withCredits(opts, async () => 'never')

    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('expected err')
    expect(result.error.message).toBe('Could not complete the action')
  })
})

describe('processPaymentEvent — no internal detail crosses the Result boundary', () => {
  const event: ParsedWebhookEvent = {
    provider: 'fixture',
    eventId: 'evt-1',
    eventType: 'payment_succeeded',
    workspaceId: 'ws-1',
    planId: 'starter',
    period: '2026-07',
    mode: 'fixture',
    raw: {},
  }

  it('returns a fixed message when the store throws', async () => {
    const processPaymentEvent = createProcessPaymentEvent({
      store: {
        claim: async () => {
          throw new Error(LEAKY)
        },
        markProcessed: async () => {},
        markFailed: async () => {},
      },
      applyPlanGrant: async () => {
        throw new Error('unused')
      },
      newTraceId: () => 't-1',
    })

    const result = await processPaymentEvent(event)

    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('expected err')
    expect(result.error.code).toBe('PROVIDER_ERROR')
    expect(result.error.message).toBe('Could not process the payment event')
    expect(result.error.message).not.toContain('hunter2')
  })

  it('hands the raw cause to onError', async () => {
    const seen: unknown[] = []
    const processPaymentEvent = createProcessPaymentEvent({
      store: {
        claim: async () => {
          throw new Error(LEAKY)
        },
        markProcessed: async () => {},
        markFailed: async () => {},
      },
      applyPlanGrant: async () => {
        throw new Error('unused')
      },
      newTraceId: () => 't-1',
      onError: (cause) => seen.push(cause),
    })

    await processPaymentEvent(event)

    expect((seen[0] as Error).message).toBe(LEAKY)
  })
})
