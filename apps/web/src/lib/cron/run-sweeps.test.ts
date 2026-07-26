import { describe, it, expect, vi } from 'vitest'
import type { DispatchSweepReport, HoldSweepReport } from '@sahoda/jobs/sweeps'
import { runCronSweeps } from './run-sweeps'

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i

function dispatchReport(over: Partial<DispatchSweepReport> = {}): DispatchSweepReport {
  return {
    mode: 'on',
    scanned: 0,
    enqueued: 0,
    expired: 0,
    settled: 0,
    wouldDispatch: 0,
    wouldExpire: 0,
    wouldSettle: 0,
    held: 0,
    holdsByReason: {},
    blockedByGuard: 0,
    queueUnavailable: 0,
    failed: 0,
    decisions: [],
    ...over,
  }
}

function holdReport(over: Partial<HoldSweepReport> = {}): HoldSweepReport {
  return {
    mode: 'on',
    scanned: 0,
    released: 0,
    wouldRelease: 0,
    alreadySettled: 0,
    failed: 0,
    ...over,
  }
}

describe('runCronSweeps', () => {
  it('returns the counters from both sweeps', async () => {
    const outcome = await runCronSweeps({
      runDispatch: async () => dispatchReport({ scanned: 4, expired: 3, queueUnavailable: 1 }),
      runHolds: async () => holdReport({ scanned: 2, released: 2 }),
    })

    expect(outcome.status).toBe(200)
    expect(outcome.body).toMatchObject({
      ok: true,
      dispatch: { scanned: 4, expired: 3, queueUnavailable: 1 },
      holds: { scanned: 2, released: 2 },
    })
  })

  it('never puts a post id, workspace id or decision in the response body', async () => {
    // The response leaves the building on a public URL. Counters are safe to return;
    // per-row detail is not, and the dispatch report carries a decisions array full of
    // post and workspace ids. Anything identifying belongs in the runtime log.
    const outcome = await runCronSweeps({
      runDispatch: async () =>
        dispatchReport({
          scanned: 1,
          expired: 1,
          decisions: [
            {
              postId: 'dbd4052d-3747-4de9-8383-60e83cd13cd0',
              kind: 'expire',
              reason: 'no-variants-past-grace',
            },
          ],
        }),
      runHolds: async () => holdReport(),
    })

    const serialized = JSON.stringify(outcome.body)
    expect(serialized).not.toMatch(UUID)
    expect(serialized).not.toContain('decisions')
    expect(serialized).not.toContain('dbd4052d')
  })

  it('runs the hold sweep even when the dispatch sweep throws', async () => {
    // Stranded credits are the user's money. A dispatcher failure must not be able to
    // stop the reaper - they share a request, not a fate.
    const runHolds = vi.fn(async () => holdReport({ scanned: 5, released: 5 }))

    const outcome = await runCronSweeps({
      runDispatch: async () => {
        throw new Error('boom')
      },
      runHolds,
    })

    expect(runHolds).toHaveBeenCalledOnce()
    expect(outcome.body.holds).toMatchObject({ released: 5 })
  })

  it('answers 500 when either sweep fails, so a broken tick is visible in the dashboard', async () => {
    const dispatchFailed = await runCronSweeps({
      runDispatch: async () => {
        throw new Error('boom')
      },
      runHolds: async () => holdReport(),
    })
    const holdsFailed = await runCronSweeps({
      runDispatch: async () => dispatchReport(),
      runHolds: async () => {
        throw new Error('boom')
      },
    })

    expect(dispatchFailed.status).toBe(500)
    expect(holdsFailed.status).toBe(500)
    expect(dispatchFailed.body.ok).toBe(false)
    expect(holdsFailed.body.ok).toBe(false)
  })

  it('names the failing sweep without echoing the error', async () => {
    // A database error message can carry a connection string, a host or a query.
    const outcome = await runCronSweeps({
      runDispatch: async () => {
        throw new Error('connect ECONNREFUSED postgres://u:hunter2@db.internal:5432')
      },
      runHolds: async () => holdReport(),
    })

    const serialized = JSON.stringify(outcome.body)
    expect(outcome.body.dispatch).toEqual({ error: 'dispatch-sweep-failed' })
    expect(serialized).not.toContain('hunter2')
    expect(serialized).not.toContain('ECONNREFUSED')
    expect(serialized).not.toContain('db.internal')
  })

  it('hands the real error to the caller so it can be logged', async () => {
    const boom = new Error('connection terminated')
    const onError = vi.fn()

    await runCronSweeps({
      runDispatch: async () => {
        throw boom
      },
      runHolds: async () => holdReport(),
      onError,
    })

    expect(onError).toHaveBeenCalledWith('dispatch', boom)
  })

  it('is an all-zero no-op when both flags are off', async () => {
    // The deploy-changes-nothing property, at the layer the route actually returns.
    const outcome = await runCronSweeps({
      runDispatch: async () => dispatchReport({ mode: 'off' }),
      runHolds: async () => holdReport({ mode: 'off' }),
    })

    expect(outcome.status).toBe(200)
    expect(outcome.body).toEqual({
      ok: true,
      dispatch: {
        mode: 'off',
        scanned: 0,
        enqueued: 0,
        expired: 0,
        settled: 0,
        wouldDispatch: 0,
        wouldExpire: 0,
        wouldSettle: 0,
        held: 0,
        holdsByReason: {},
        blockedByGuard: 0,
        queueUnavailable: 0,
        failed: 0,
      },
      holds: {
        mode: 'off',
        scanned: 0,
        released: 0,
        wouldRelease: 0,
        alreadySettled: 0,
        failed: 0,
      },
    })
  })
})
