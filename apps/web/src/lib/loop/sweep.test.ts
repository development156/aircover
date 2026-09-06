import { describe, it, expect, vi } from 'vitest'

import {
  runLoopSweep,
  CYCLE_STALE_AFTER_HOURS,
  type StaleCycleCandidate,
  type ExpireCycleResult,
} from './sweep'

/**
 * THE STALE-CYCLE REAPER.
 *
 * A live cycle holds the week's only slot (loop_cycles_one_live_per_week). A halt
 * nobody approves, or a stage that died, would hold it for ever. This sweep ages
 * such cycles to `cancelled` and releases any HOLD they stranded. All I/O is
 * injected, so what is tested is the DECISION: which rows are stale, that a fresh
 * one is left alone, that a lost race is not counted, and that holds are released.
 */

const NOW = new Date('2026-09-06T12:00:00.000Z')
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3_600_000).toISOString()

const cycle = (over: Partial<StaleCycleCandidate> = {}): StaleCycleCandidate => ({
  id: 'cyc-1',
  workspaceId: 'ws-1',
  status: 'awaiting_cost_approval',
  startedAt: hoursAgo(100),
  ...over,
})

describe('runLoopSweep', () => {
  it('leaves a fresh cycle alone — young awaiting_cost_approval is not swept', async () => {
    const expireCycle = vi.fn(async (): Promise<ExpireCycleResult> => ({
      expired: true,
      holds: [],
    }))
    const report = await runLoopSweep({
      now: () => NOW,
      listLiveCycles: async () => [cycle({ startedAt: hoursAgo(1) })],
      expireCycle,
      releaseHold: async () => {},
    })
    expect(report.scanned).toBe(1)
    expect(report.expired).toBe(0)
    expect(expireCycle).not.toHaveBeenCalled()
  })

  it('expires a stale awaiting_cost_approval past its 72h rope', async () => {
    const expireCycle = vi.fn(async (): Promise<ExpireCycleResult> => ({
      expired: true,
      holds: [],
    }))
    const report = await runLoopSweep({
      now: () => NOW,
      listLiveCycles: async () => [
        cycle({ startedAt: hoursAgo(CYCLE_STALE_AFTER_HOURS.awaiting_cost_approval + 1) }),
      ],
      expireCycle,
      releaseHold: async () => {},
    })
    expect(report.expired).toBe(1)
    expect(expireCycle).toHaveBeenCalledWith({ cycleId: 'cyc-1', workspaceId: 'ws-1' })
  })

  it('expires a stale planning cycle past the 24h working threshold', async () => {
    const expireCycle = vi.fn(async (): Promise<ExpireCycleResult> => ({
      expired: true,
      holds: [],
    }))
    const report = await runLoopSweep({
      now: () => NOW,
      listLiveCycles: async () => [cycle({ status: 'planning', startedAt: hoursAgo(25) })],
      expireCycle,
      releaseHold: async () => {},
    })
    expect(report.expired).toBe(1)
  })

  it('releases each HOLD a cancelled cycle left, through the ledger', async () => {
    const releaseHold = vi.fn(async () => {})
    const report = await runLoopSweep({
      now: () => NOW,
      listLiveCycles: async () => [cycle({ startedAt: hoursAgo(100) })],
      expireCycle: async () => ({
        expired: true,
        holds: [
          { entryId: 'e1', amount: 20 },
          { entryId: 'e2', amount: 3 },
        ],
      }),
      releaseHold,
    })
    expect(report.expired).toBe(1)
    expect(releaseHold).toHaveBeenCalledTimes(2)
    expect(releaseHold).toHaveBeenCalledWith({
      workspaceId: 'ws-1',
      hold: { entryId: 'e1', amount: 20 },
    })
  })

  it('does not count a lost race — expireCycle returning expired:false is not an expiry', async () => {
    const releaseHold = vi.fn(async () => {})
    const report = await runLoopSweep({
      now: () => NOW,
      listLiveCycles: async () => [cycle({ startedAt: hoursAgo(100) })],
      expireCycle: async () => ({ expired: false, holds: [] }),
      releaseHold,
    })
    expect(report.scanned).toBe(1)
    expect(report.expired).toBe(0)
    expect(releaseHold).not.toHaveBeenCalled()
  })

  it('one poison row never aborts the sweep — the next cycle is still examined', async () => {
    const onError = vi.fn()
    let call = 0
    const report = await runLoopSweep({
      now: () => NOW,
      listLiveCycles: async () => [
        cycle({ id: 'bad', startedAt: hoursAgo(100) }),
        cycle({ id: 'good', workspaceId: 'ws-2', startedAt: hoursAgo(100) }),
      ],
      expireCycle: async () => {
        call += 1
        if (call === 1) throw new Error('db blip')
        return { expired: true, holds: [] }
      },
      releaseHold: async () => {},
      onError,
    })
    expect(report.expired).toBe(1)
    expect(onError).toHaveBeenCalledOnce()
  })
})
