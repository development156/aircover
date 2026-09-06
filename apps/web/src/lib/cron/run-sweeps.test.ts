import { describe, it, expect, vi } from 'vitest'
import type { DispatchSweepReport, HoldSweepReport } from '@sahoda/jobs/sweeps'
import type { ReconcileReport } from '@sahoda/jobs/publish'
import type { LoopSweepReport } from '@/lib/loop/sweep'
import { runCronSweeps } from './run-sweeps'

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i

/** The rail production was actually on when this was written. See the config describe below. */
const SIMULATED_RAIL = { publishMode: 'fixture', publishEnabled: false } as const

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

function reconcileReport(over: Partial<ReconcileReport> = {}): ReconcileReport {
  return {
    mode: 'on',
    outcome: 'clean',
    connectionsChecked: 0,
    connectionsUpdated: 0,
    wouldUpdate: 0,
    connectionsFailed: 0,
    publishesChecked: 0,
    publishesResolved: 0,
    wouldResolve: 0,
    publishesFailed: 0,
    stillPending: 0,
    failed: 0,
    failures: [],
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

function loopReport(over: Partial<LoopSweepReport> = {}): LoopSweepReport {
  return { scanned: 0, expired: 0, ...over }
}

describe('runCronSweeps', () => {
  it('returns the counters from both sweeps', async () => {
    const outcome = await runCronSweeps({
      config: SIMULATED_RAIL,
      runDispatch: async () => dispatchReport({ scanned: 4, expired: 3, queueUnavailable: 1 }),
      runHolds: async () => holdReport({ scanned: 2, released: 2 }),
      runReconcile: async () => reconcileReport(),
      runLoop: async () => loopReport(),
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
      config: SIMULATED_RAIL,
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
      runReconcile: async () => reconcileReport(),
      runLoop: async () => loopReport(),
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
      config: SIMULATED_RAIL,
      runDispatch: async () => {
        throw new Error('boom')
      },
      runHolds,
      runReconcile: async () => reconcileReport(),
      runLoop: async () => loopReport(),
    })

    expect(runHolds).toHaveBeenCalledOnce()
    expect(outcome.body.holds).toMatchObject({ released: 5 })
  })

  it('answers 500 when either sweep fails, so a broken tick is visible in the dashboard', async () => {
    const dispatchFailed = await runCronSweeps({
      config: SIMULATED_RAIL,
      runDispatch: async () => {
        throw new Error('boom')
      },
      runHolds: async () => holdReport(),
      runReconcile: async () => reconcileReport(),
      runLoop: async () => loopReport(),
    })
    const holdsFailed = await runCronSweeps({
      config: SIMULATED_RAIL,
      runDispatch: async () => dispatchReport(),
      runHolds: async () => {
        throw new Error('boom')
      },
      runReconcile: async () => reconcileReport(),
      runLoop: async () => loopReport(),
    })

    // RETARGETED: a bare `status`/`ok` pair cannot tell which sweep failed, and
    // this is the ONE test that throws from `runHolds` — nothing else pins
    // that `attempt()` names the RIGHT scope for a holds failure rather than
    // mislabelling it as the dispatch sweep, which `isError`/`ok` alone would
    // not catch since both produce the same shape.
    expect(dispatchFailed.status).toBe(500)
    expect(holdsFailed.status).toBe(500)
    expect(dispatchFailed.body.ok).toBe(false)
    expect(holdsFailed.body.ok).toBe(false)
    expect(dispatchFailed.body.dispatch).toEqual({ error: 'dispatch-sweep-failed' })
    expect(holdsFailed.body.holds).toEqual({ error: 'hold-sweep-failed' })
  })

  it('names the failing sweep without echoing the error', async () => {
    // A database error message can carry a connection string, a host or a query.
    const outcome = await runCronSweeps({
      config: SIMULATED_RAIL,
      runDispatch: async () => {
        throw new Error('connect ECONNREFUSED postgres://u:hunter2@db.internal:5432')
      },
      runHolds: async () => holdReport(),
      runReconcile: async () => reconcileReport(),
      runLoop: async () => loopReport(),
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
      config: SIMULATED_RAIL,
      runDispatch: async () => {
        throw boom
      },
      runHolds: async () => holdReport(),
      runReconcile: async () => reconcileReport(),
      runLoop: async () => loopReport(),
      onError,
    })

    expect(onError).toHaveBeenCalledWith('dispatch', boom)
  })

  it('runs the reconcile pass BEFORE dispatch, so an accepted post is settled before it can be re-sent', async () => {
    // Tick T0 publishes an Instagram variant; Meta takes longer than the adapter's 36s
    // poll; the adapter throws STILL_PROCESSING and the claim is handed back as
    // `scheduled`. If the next tick dispatched first, the reconcile pass that would have
    // found the first post live would run AFTER the second POST had already gone out.
    // Reconcile is one bounded batch of Zernio reads; dispatch can spend ~200s
    // publishing, so the pass that can wait is also the one that must not be last.
    const order: string[] = []
    const outcome = await runCronSweeps({
      config: SIMULATED_RAIL,
      runDispatch: async () => {
        order.push('dispatch')
        return dispatchReport()
      },
      runHolds: async () => {
        order.push('holds')
        return holdReport()
      },
      runReconcile: async () => {
        order.push('reconcile')
        return reconcileReport()
      },
      runLoop: async () => {
        order.push('loop')
        return loopReport()
      },
    })

    expect(outcome.status).toBe(200)
    expect(order.indexOf('reconcile')).toBeLessThan(order.indexOf('dispatch'))
    expect(order).toEqual(['reconcile', 'holds', 'loop', 'dispatch'])
  })

  it('still dispatches when the reconcile pass throws, so a Zernio outage cannot stop publishing', async () => {
    const runDispatch = vi.fn(async () => dispatchReport({ scanned: 1, enqueued: 1 }))

    const outcome = await runCronSweeps({
      config: SIMULATED_RAIL,
      runDispatch,
      runHolds: async () => holdReport(),
      runReconcile: async () => {
        throw new Error('Zernio returned 500')
      },
      runLoop: async () => loopReport(),
    })

    expect(runDispatch).toHaveBeenCalledOnce()
    expect(outcome.body.dispatch).toMatchObject({ enqueued: 1 })
    expect(outcome.body.reconcile).toEqual({ error: 'reconcile-sweep-failed' })
  })

  it('is an all-zero no-op when every flag is off', async () => {
    // The deploy-changes-nothing property, at the layer the route actually returns.
    // Three sweeps now, and the property must hold for all of them: the reconcile
    // pass flips connections to `expired`, so deploying it must not start doing so.
    const outcome = await runCronSweeps({
      config: SIMULATED_RAIL,
      runDispatch: async () => dispatchReport({ mode: 'off' }),
      runHolds: async () => holdReport({ mode: 'off' }),
      runReconcile: async () => reconcileReport({ mode: 'off' }),
      runLoop: async () => loopReport(),
    })

    expect(outcome.status).toBe(200)
    expect(outcome.body).toEqual({
      ok: true,
      // Reported even by a tick that does nothing — "which rail am I on" is a question
      // about the deployment, not about the work this tick happened to find.
      config: SIMULATED_RAIL,
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
      reconcile: {
        mode: 'off',
        // `clean` is the honest word for a pass that did nothing because it was
        // told to do nothing. It is `failed` that a wholly-failed pass now says.
        outcome: 'clean',
        connectionsChecked: 0,
        connectionsUpdated: 0,
        wouldUpdate: 0,
        connectionsFailed: 0,
        publishesChecked: 0,
        publishesResolved: 0,
        wouldResolve: 0,
        publishesFailed: 0,
        stillPending: 0,
        failed: 0,
        failures: [],
      },
      // The stale-Loop-cycle reaper: counts only, and zero on a tick that finds nothing.
      loop: { scanned: 0, expired: 0 },
    })
  })
})

/**
 * The tick reports which publish rail it is actually on.
 *
 * On 2026-08-09 every published variant in production turned out to be `mode: 'fixture'`
 * — simulated posts, reported to the customer as published, for the entire life of the
 * table. Nothing on any surface said so. `publishMode` defaults to `fixture` and
 * `SAHODA_PUBLISH_MODE` was absent from turbo.json's build allowlist, so the value could
 * not even be changed from the Vercel project: setting it did nothing and said nothing.
 *
 * Two flags decide whether a real post goes out, and they are easy to confuse because
 * only one of them was visible. This puts both on the one authenticated surface that
 * already runs every five minutes, so "which rail is production on" is a question with
 * a measured answer instead of an inferred one.
 *
 * Counts-and-codes only, like the rest of the body: two enum-ish values, no secret, no id.
 */
describe('the tick says which publish rail it is on', () => {
  const runners = {
    runDispatch: () => Promise.resolve(dispatchReport()),
    runHolds: () => Promise.resolve(holdReport()),
    runReconcile: () => Promise.resolve(reconcileReport()),
    runLoop: () => Promise.resolve(loopReport()),
  }

  it('reports the resolved publish mode and whether publishing is permitted', async () => {
    const outcome = await runCronSweeps({
      ...runners,
      config: { publishMode: 'fixture', publishEnabled: false },
    })
    expect(outcome.body.config).toEqual({ publishMode: 'fixture', publishEnabled: false })
  })

  it('reports live when that is what resolved', async () => {
    const outcome = await runCronSweeps({
      ...runners,
      config: { publishMode: 'live', publishEnabled: true },
    })
    expect(outcome.body.config).toEqual({ publishMode: 'live', publishEnabled: true })
  })

  it('still reports the config when a sweep failed', async () => {
    const outcome = await runCronSweeps({
      ...runners,
      runDispatch: () => Promise.reject(new Error('boom')),
      config: { publishMode: 'fixture', publishEnabled: false },
    })
    expect(outcome.status).toBe(500)
    // The one field an operator most needs when a tick is failing.
    expect(outcome.body.config.publishMode).toBe('fixture')
  })
})
