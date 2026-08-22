import { describe, it, expect } from 'vitest'

import type { BeginFetchRequest, BeginFetchResult, FinishFetchRequest, RadarDb } from './db'
import { withSpend, isRefusal, type SpendRequest } from './spend'

/**
 * THE COST CAP MUST REFUSE BEFORE IT SPENDS.
 *
 * Not "raise afterwards" — that is a cap that pays the bill and then complains.
 * The only way to prove the difference is to COUNT CALLS on the thing that costs
 * money and require the count to be zero. A test that merely asserts an error was
 * thrown passes just as happily against a cap that fires after the request has
 * already gone out, which is no cap at all.
 *
 * So the transport below records every invocation, and the assertion prints the
 * count. `expect(transport.calls).toBe(0)` is the whole point of this file.
 */

/** A transport that costs money, and remembers whether anyone touched it. */
function countingTransport() {
  const state = { calls: 0 }
  return {
    state,
    async call() {
      state.calls += 1
      return { charged: true }
    },
  }
}

interface FakeDbOptions {
  permission: BeginFetchResult
}

function fakeDb(options: FakeDbOptions) {
  const began: BeginFetchRequest[] = []
  const finished: FinishFetchRequest[] = []
  const db: RadarDb = {
    async dueSources() {
      return []
    },
    async beginFetch(request) {
      began.push(request)
      return options.permission
    },
    async finishFetch(request) {
      finished.push(request)
    },
    async insertSnapshot() {
      return null
    },
    async previousSnapshot() {
      return null
    },
    async insertChange() {},
    async rememberCheck() {},
  }
  return { db, began, finished }
}

const REQUEST: SpendRequest = {
  sourceId: 'src-1',
  mode: 'render',
  provider: 'apify',
  estimateMicros: 2600,
  costBasis: 'measured',
}

describe('the spending cap refuses before it spends', () => {
  it('does NOT call the provider when the daily cap is reached', async () => {
    const transport = countingTransport()
    const { db, finished } = fakeDb({
      permission: {
        allowed: false,
        reason: 'DAILY_CAP',
        spentMicros: 1_999_000,
        capMicros: 2_000_000,
      },
    })

    const result = await withSpend(db, REQUEST, async () => ({
      outcome: 'changed' as const,
      costMicros: 2600,
      value: await transport.call(),
    }))

    console.log(`  provider calls after a DAILY_CAP refusal: ${transport.state.calls}`)
    expect(transport.state.calls).toBe(0)

    // And nothing was recorded as spent either — a refusal that wrote a fetch-log
    // row would count its own estimate against tomorrow's budget.
    console.log(`  fetch-log settlements written: ${finished.length}`)
    expect(finished).toHaveLength(0)

    expect(isRefusal(result)).toBe(true)
    expect(result).toMatchObject({
      spent: false,
      reason: 'DAILY_CAP',
      spentMicros: 1_999_000,
      capMicros: 2_000_000,
    })
  })

  it('does NOT call the provider when one workspace has used up its own share', async () => {
    const transport = countingTransport()
    const { db } = fakeDb({
      permission: {
        allowed: false,
        reason: 'WORKSPACE_CAP',
        workspaceId: 'ws-1',
        spentMicros: 49_000,
        capMicros: 50_000,
      },
    })

    const result = await withSpend(db, REQUEST, async () => ({
      outcome: 'changed' as const,
      costMicros: 2600,
      value: await transport.call(),
    }))

    console.log(`  provider calls after a WORKSPACE_CAP refusal: ${transport.state.calls}`)
    expect(transport.state.calls).toBe(0)
    expect(isRefusal(result) && result.reason).toBe('WORKSPACE_CAP')
  })

  it('does NOT call the provider for a competitor nobody watches any more', async () => {
    // Spending money on an answer with no reader is the cheapest bug to have and
    // the easiest to miss, because everything about the run looks healthy.
    const transport = countingTransport()
    const { db } = fakeDb({ permission: { allowed: false, reason: 'NO_SUBSCRIBERS' } })

    await withSpend(db, REQUEST, async () => ({
      outcome: 'changed' as const,
      costMicros: 2600,
      value: await transport.call(),
    }))

    console.log(`  provider calls for an unsubscribed source: ${transport.state.calls}`)
    expect(transport.state.calls).toBe(0)
  })

  // ── and the other half: when it IS allowed, it must actually run and settle ──

  it('calls the provider exactly once when allowed, and settles the real cost', async () => {
    const transport = countingTransport()
    const { db, began, finished } = fakeDb({
      permission: { allowed: true, reservationId: 'res-1', subscriberCount: 6 },
    })

    const result = await withSpend(db, REQUEST, async (ctx) => {
      expect(ctx.reservationId).toBe('res-1')
      return {
        outcome: 'changed' as const,
        // What it REALLY cost, which is not always the estimate.
        costMicros: 2600,
        costBasis: 'measured' as const,
        detail: { via: 'apify' },
        value: await transport.call(),
      }
    })

    console.log(`  provider calls when allowed: ${transport.state.calls}`)
    expect(transport.state.calls).toBe(1)
    // The reservation carried the ESTIMATE out; the settlement carried the truth back.
    expect(began[0]).toMatchObject({ estimateMicros: 2600, costBasis: 'measured' })
    expect(finished[0]).toMatchObject({
      reservationId: 'res-1',
      outcome: 'changed',
      costMicros: 2600,
      costBasis: 'measured',
    })
    expect(result).toMatchObject({ spent: true, reservationId: 'res-1' })
  })

  it('settles a crashed request at the estimate rather than leaving it pending', async () => {
    // A reservation left 'pending' keeps its estimate counted against the cap for
    // ever. A handful of crashes would wedge the whole feature shut by lunchtime,
    // and the symptom — "Radar stopped checking" — would point nowhere near here.
    //
    // Settled at the ESTIMATE and not at zero: a request that failed after it went
    // out has very likely already been charged.
    const { db, finished } = fakeDb({
      permission: { allowed: true, reservationId: 'res-2', subscriberCount: 1 },
    })

    await expect(
      withSpend(db, REQUEST, async () => {
        throw new Error('socket hang up')
      }),
    ).rejects.toThrow('socket hang up')

    console.log('  settlement after a crash:', JSON.stringify(finished[0]))
    expect(finished).toHaveLength(1)
    expect(finished[0]).toMatchObject({
      reservationId: 'res-2',
      outcome: 'could_not_check',
      costMicros: 2600,
    })
  })
})
