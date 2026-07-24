import { describe, it, expect, vi } from 'vitest'
import { appError, err, ok, type Result } from '@sahoda/shared'
import { createProcessPaymentEvent, type ProcessPaymentEventDeps } from './processPaymentEvent'
import type { PlanGrantResult } from './applyPlanGrant'
import type { WebhookClaim, WebhookEventInput, WebhookEventStore } from './store'
import type { ParsedWebhookEvent } from '../providers/types'

class FakeStore implements WebhookEventStore {
  claimResult: WebhookClaim = { id: 'row-1', alreadyProcessed: false }
  claimThrows = false
  readonly claimed: WebhookEventInput[] = []
  readonly processedIds: string[] = []
  readonly failed: { id: string; error: string }[] = []

  async claim(input: WebhookEventInput): Promise<WebhookClaim> {
    this.claimed.push(input)
    if (this.claimThrows) throw new Error('db down')
    return this.claimResult
  }
  async markProcessed(id: string): Promise<void> {
    this.processedIds.push(id)
  }
  async markFailed(id: string, error: string): Promise<void> {
    this.failed.push({ id, error })
  }
}

const event: ParsedWebhookEvent = {
  provider: 'fixture',
  eventId: 'evt-1',
  eventType: 'payment_succeeded',
  workspaceId: 'ws-1',
  planId: 'starter',
  period: '2026-07',
  mode: 'fixture',
  raw: { hi: 'there' },
}

const grantOk = async (): Promise<Result<PlanGrantResult>> =>
  ok({ granted: 1500, balanceAfter: 1500, replayed: false })
const deps = (over: { applyPlanGrant?: ProcessPaymentEventDeps['applyPlanGrant'] } = {}) => ({
  store: new FakeStore(), // kept as FakeStore so tests can set claimResult / claimThrows
  applyPlanGrant: over.applyPlanGrant ?? vi.fn(grantOk),
  newTraceId: () => 'trace-fixed',
})

describe('processPaymentEvent — idempotent webhook processing', () => {
  it('claims the event, applies the grant, and marks the row processed', async () => {
    const d = deps()
    const process = createProcessPaymentEvent(d)

    const result = await process(event)

    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('expected ok')
    expect(result.data.status).toBe('processed')
    expect(result.data.grant?.granted).toBe(1500)
    // claim carries provider + event_id + type + the raw payload for the audit row
    expect(d.store.claimed).toEqual([
      {
        provider: 'fixture',
        eventId: 'evt-1',
        eventType: 'payment_succeeded',
        payload: { hi: 'there' },
      },
    ])
    expect(d.applyPlanGrant).toHaveBeenCalledOnce()
    expect(d.store.processedIds).toEqual(['row-1'])
    expect(d.store.failed).toEqual([])
  })

  it('skips an already-processed event (no re-grant, no double charge)', async () => {
    const d = deps()
    d.store.claimResult = { id: 'row-1', alreadyProcessed: true }
    const process = createProcessPaymentEvent(d)

    const result = await process(event)

    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('expected ok')
    expect(result.data.status).toBe('duplicate')
    expect(result.data.grant).toBeNull()
    expect(d.applyPlanGrant).not.toHaveBeenCalled()
    expect(d.store.processedIds).toEqual([])
  })

  it('marks the row failed and propagates the error when the grant fails', async () => {
    const d = deps({
      applyPlanGrant: vi.fn(async () => err(appError('PROVIDER_ERROR', 'ledger down', 'tr'))),
    })
    const process = createProcessPaymentEvent(d)

    const result = await process(event)

    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('expected err')
    expect(result.error.code).toBe('PROVIDER_ERROR')
    expect(d.store.failed).toEqual([{ id: 'row-1', error: 'PROVIDER_ERROR: ledger down' }])
    expect(d.store.processedIds).toEqual([])
  })

  /**
   * A failed or dropped payment is ROUTINE traffic, not an error. Cashfree emits
   * PAYMENT_FAILED_WEBHOOK / PAYMENT_USER_DROPPED_WEBHOOK and the adapter normalizes both to
   * `payment_failed`. Driving those into applyPlanGrant (which only handles payment_succeeded)
   * produced a VALIDATION_ERROR, marked the audit row 'failed', and returned !ok — so the route
   * answered non-2xx, the provider redelivered, and pgStore re-drove the row because it treats
   * only 'processed' as terminal. An infinite redelivery loop, plus an audit trail that records
   * a failure where nothing failed.
   */
  describe.each([
    ['a failed payment', 'payment_failed' as const],
    ['an unrecognized event', 'unknown' as const],
  ])('%s is handled, not failed', (_label, eventType) => {
    it('grants nothing, marks the row processed, and reports ok', async () => {
      const d = deps()
      const process = createProcessPaymentEvent(d)

      const result = await process({ ...event, eventType })

      expect(result.ok).toBe(true)
      if (!result.ok) throw new Error('expected ok')
      expect(result.data.status).toBe('ignored')
      expect(result.data.grant).toBeNull()
      // Never reaches the grant — that is what produced the VALIDATION_ERROR.
      expect(d.applyPlanGrant).not.toHaveBeenCalled()
      // Terminal state: pgStore only skips rows marked 'processed', so this ends redelivery.
      expect(d.store.processedIds).toEqual(['row-1'])
      // The audit row must NOT claim a failure — nothing failed.
      expect(d.store.failed).toEqual([])
    })

    it('is still recorded in the audit trail with its real event type', async () => {
      const d = deps()
      const process = createProcessPaymentEvent(d)

      await process({ ...event, eventType })

      expect(d.store.claimed).toEqual([
        { provider: 'fixture', eventId: 'evt-1', eventType, payload: { hi: 'there' } },
      ])
    })

    it('is skipped as a duplicate on redelivery rather than re-driven', async () => {
      const d = deps()
      d.store.claimResult = { id: 'row-1', alreadyProcessed: true }
      const process = createProcessPaymentEvent(d)

      const result = await process({ ...event, eventType })

      expect(result.ok).toBe(true)
      if (!result.ok) throw new Error('expected ok')
      expect(result.data.status).toBe('duplicate')
      expect(d.applyPlanGrant).not.toHaveBeenCalled()
    })
  })

  it('returns an err Result (does not reject) when the claim insert throws', async () => {
    const d = deps()
    d.store.claimThrows = true
    const process = createProcessPaymentEvent(d)

    const result = await process(event)

    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('expected err')
    expect(result.error.code).toBe('PROVIDER_ERROR')
    expect(d.applyPlanGrant).not.toHaveBeenCalled()
  })
})
