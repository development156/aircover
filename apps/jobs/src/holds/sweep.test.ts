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
      mode: 'on',
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
      mode: 'on',
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
      mode: 'on',
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
      mode: 'on',
      listExpiredHolds: async () => [],
      apply: async () => {
        applyCalls += 1
        return applied()
      },
    })

    expect(applyCalls).toBe(0)
    expect(report).toMatchObject({ scanned: 0, released: 0, alreadySettled: 0, failed: 0 })
  })

  it('reads nothing at all when off', async () => {
    // `off` must be cheaper than an empty sweep: deploying the reaper somewhere new must
    // not even query the ledger until someone grants it that.
    let listCalls = 0
    const report = await sweepExpiredHolds({
      mode: 'off',
      listExpiredHolds: async () => {
        listCalls += 1
        return [hold()]
      },
      apply: async () => {
        throw new Error('off mode must not apply')
      },
    })

    expect(listCalls).toBe(0)
    expect(report).toMatchObject({ mode: 'off', scanned: 0, released: 0, wouldRelease: 0 })
  })

  it('counts what it would release without applying anything in report mode', async () => {
    const report = await sweepExpiredHolds({
      mode: 'report',
      listExpiredHolds: async () => [hold(), hold({ id: '55555555-5555-4555-8555-555555555555' })],
      apply: async () => {
        throw new Error('report mode must not apply')
      },
    })

    expect(report).toMatchObject({
      mode: 'report',
      scanned: 2,
      wouldRelease: 2,
      released: 0,
      failed: 0,
    })
  })

  it('reports the same intent count in report mode as it executes in on mode', async () => {
    // The point of report mode is that its numbers predict what `on` will do. If the two
    // are computed from different things, reviewing a report proves nothing.
    const holds = [hold(), hold({ id: '66666666-6666-4666-8666-666666666666' })]
    const dry = await sweepExpiredHolds({
      mode: 'report',
      listExpiredHolds: async () => holds,
      apply: async () => applied(),
    })
    const wet = await sweepExpiredHolds({
      mode: 'on',
      listExpiredHolds: async () => holds,
      apply: async () => applied(),
    })

    expect(dry.wouldRelease).toBe(wet.wouldRelease)
    expect(wet.released).toBe(dry.wouldRelease)
  })
})
