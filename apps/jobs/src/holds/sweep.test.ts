import { describe, it, expect } from 'vitest'
import { expiredReleaseKey } from '@sahoda/shared'
import type { ApplyLedgerInput } from '@sahoda/shared'
import type { LedgerApplyResult } from '@sahoda/billing'
import { sweepExpiredHolds, type ExpiredHold } from './sweep'

const hold = (over: Partial<ExpiredHold> = {}): ExpiredHold => ({
  id: '11111111-1111-4111-8111-111111111111',
  workspaceId: '22222222-2222-4222-8222-222222222222',
  amount: 20,
  idempotencyKey: 'plan_week:obj-1:1',
  ...over,
})

const applied = (): LedgerApplyResult => ({
  entry: { id: 'entry-1', balanceAfter: 100 },
  replayed: false,
})

describe('sweepExpiredHolds', () => {
  it('releases an expired hold via the ledger using the expired_release key', async () => {
    const h = hold()
    const calls: ApplyLedgerInput[] = []

    const report = await sweepExpiredHolds({
      listExpiredHolds: async () => [h],
      apply: async (input) => {
        calls.push(input)
        return applied()
      },
    })

    expect(calls).toHaveLength(1)
    expect(calls[0]).toMatchObject({
      workspaceId: h.workspaceId,
      entryType: 'RELEASE',
      amount: h.amount,
      idempotencyKey: expiredReleaseKey(h.idempotencyKey),
      settlesEntryId: h.id,
    })
    expect(report).toMatchObject({ scanned: 1, released: 1, alreadySettled: 0, failed: 0 })
  })

  it('treats HOLD_ALREADY_SETTLED as a no-op rather than a failure', async () => {
    // A late DEBIT beat the sweep to the hold. The user was charged for real work;
    // the sweep losing that race is the correct outcome, not an error.
    const report = await sweepExpiredHolds({
      listExpiredHolds: async () => [hold()],
      apply: async () => {
        throw new Error('HOLD_ALREADY_SETTLED')
      },
    })

    expect(report).toMatchObject({ scanned: 1, released: 0, alreadySettled: 1, failed: 0 })
  })

  it('continues sweeping after one hold fails', async () => {
    const good = hold({ id: '33333333-3333-4333-8333-333333333333', idempotencyKey: 'a:o:1' })
    const bad = hold({ id: '44444444-4444-4444-8444-444444444444', idempotencyKey: 'b:o:1' })
    const released: string[] = []

    const report = await sweepExpiredHolds({
      listExpiredHolds: async () => [bad, good],
      apply: async (input) => {
        if (input.settlesEntryId === bad.id) throw new Error('connection terminated')
        released.push(input.settlesEntryId!)
        return applied()
      },
    })

    expect(released).toEqual([good.id])
    expect(report).toMatchObject({ scanned: 2, released: 1, alreadySettled: 0, failed: 1 })
  })

  it('writes nothing when no holds have expired', async () => {
    let applyCalls = 0
    const report = await sweepExpiredHolds({
      listExpiredHolds: async () => [],
      apply: async () => {
        applyCalls += 1
        return applied()
      },
    })

    expect(applyCalls).toBe(0)
    expect(report).toMatchObject({ scanned: 0, released: 0, alreadySettled: 0, failed: 0 })
  })
})
