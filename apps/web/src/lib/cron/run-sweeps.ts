import 'server-only'
import type { DispatchSweepReport, HoldSweepReport } from '@sahoda/jobs/sweeps'
import type { ReconcileReport } from '@sahoda/jobs/publish'
import type { LoopSweepReport } from '@/lib/loop/sweep'

/** What went wrong, named but never described — the detail goes to the log, not the wire. */
interface SweepError {
  error:
    'dispatch-sweep-failed' | 'hold-sweep-failed' | 'reconcile-sweep-failed' | 'loop-sweep-failed'
}

/** The dispatch report minus `decisions`, which carries post and workspace ids. */
type DispatchCounters = Omit<DispatchSweepReport, 'decisions'>

/**
 * Which publish rail this deployment is actually on.
 *
 * Both flags, together, because either one alone is misleading. `publishEnabled`
 * (`SAHODA_PUBLISH_ENABLED`) says the cron tick MAY publish; `publishMode`
 * (`SAHODA_PUBLISH_MODE`) says what it publishes THROUGH. A tick with
 * `publishEnabled: true` and `publishMode: 'fixture'` writes simulated posts and
 * reports them as successes — which is exactly what production did, unnoticed, for the
 * whole life of the table.
 *
 * Reported rather than inferred: `publishMode` is resolved from an env var that has a
 * default, so the only honest answer comes from the running deployment.
 */
export interface CronSweepConfig {
  publishMode: 'live' | 'fixture'
  publishEnabled: boolean
}

export interface CronSweepBody {
  ok: boolean
  /** What rail this deployment is on. Counts-and-codes only, like the rest. */
  config: CronSweepConfig
  dispatch: DispatchCounters | SweepError
  holds: HoldSweepReport | SweepError
  /** The polling stand-in for webhooks. Counters only, same as the others. */
  reconcile: ReconcileReport | SweepError
  /** The stale-Loop-cycle reaper. Counts only ({scanned, expired}); it carries no ids. */
  loop: LoopSweepReport | SweepError
}

export interface CronSweepOutcome {
  status: number
  body: CronSweepBody
}

export interface CronSweepRunners {
  runDispatch(): Promise<DispatchSweepReport>
  runHolds(): Promise<HoldSweepReport>
  runReconcile(): Promise<ReconcileReport>
  runLoop(): Promise<LoopSweepReport>
  /**
   * Required, not optional. An optional field here would be omitted by exactly the
   * caller that most needs it — the one that never thought about which rail it is on.
   */
  config: CronSweepConfig
  /** Receives the real error so the route can log it. Never reached by the response. */
  onError?(scope: SweepScope, error: unknown): void
}

type SweepScope = 'dispatch' | 'holds' | 'reconcile' | 'loop'

const ERROR_FOR: Record<SweepScope, SweepError['error']> = {
  dispatch: 'dispatch-sweep-failed',
  holds: 'hold-sweep-failed',
  reconcile: 'reconcile-sweep-failed',
  loop: 'loop-sweep-failed',
}

/**
 * One cron tick: run the three scheduled sweeps and describe what happened in counters.
 *
 * Two rules shape the response. First, the sweeps are independent — a dispatcher failure
 * must not stop the hold reaper, because stranded credits are the user's money and the
 * two share a request, not a fate. Second, the body crosses a public URL, so it carries
 * counts only: `decisions` is dropped whole rather than filtered, and a failure is named
 * (`dispatch-sweep-failed`) rather than described, since a database error message can
 * carry a connection string, a host or a query.
 *
 * ── THE ORDER IS LOAD-BEARING ────────────────────────────────────────────────
 * Reconcile runs FIRST. It used to run last, "because it is the only one that can
 * wait", and that ordering was the second half of a double post: an Instagram publish
 * the platform ACCEPTED but had not finished (STILL_PROCESSING) hands its claim back as
 * `scheduled`, and a tick that dispatched before reconciling re-sent it ~5m40s after the
 * first — on or past the ~5-minute idempotency window doc 13 §5 puts on Zernio's request
 * id. The classifier now holds such a variant, and this order makes sure the pass that
 * can END that hold has run before the dispatcher looks at the row. Reconcile is a
 * bounded batch of Zernio reads (RECONCILE_BATCH per queue); dispatch is the one that
 * can spend ~200s publishing, so it goes last, and the hold reaper — fifty guarded
 * updates — sits ahead of it rather than behind a wall-clock it cannot influence.
 *
 * A failed sweep answers 500 so a broken tick shows up as an error in the cron dashboard
 * instead of a green run that quietly did nothing. Vercel does not retry a failed
 * invocation; the next tick is the retry, and every sweep re-reads its candidates.
 */
export async function runCronSweeps(runners: CronSweepRunners): Promise<CronSweepOutcome> {
  const reconcile = await attempt('reconcile', runners.runReconcile, runners.onError)
  const holds = await attempt('holds', runners.runHolds, runners.onError)
  // Independent of the others, exactly like the hold reaper: a stranded Loop week is a
  // slot nobody can reuse, and a dispatcher or reconcile failure must not stop it.
  const loop = await attempt('loop', runners.runLoop, runners.onError)
  const dispatch = await attempt('dispatch', runners.runDispatch, runners.onError)

  const ok = !isError(dispatch) && !isError(holds) && !isError(reconcile) && !isError(loop)

  return {
    status: ok ? 200 : 500,
    body: {
      ok,
      // Outside the ok/error split on purpose: a failing tick is when an operator most
      // needs to know which rail it was on.
      config: runners.config,
      dispatch: isError(dispatch) ? dispatch : stripDecisions(dispatch),
      holds,
      reconcile,
      loop,
    },
  }
}

async function attempt<T>(
  scope: SweepScope,
  run: () => Promise<T>,
  onError: CronSweepRunners['onError'],
): Promise<T | SweepError> {
  try {
    return await run()
  } catch (e) {
    onError?.(scope, e)
    return { error: ERROR_FOR[scope] }
  }
}

function isError<T>(value: T | SweepError): value is SweepError {
  return typeof value === 'object' && value !== null && 'error' in value
}

function stripDecisions(report: DispatchSweepReport): DispatchCounters {
  // Destructured out by name rather than picked field by field: a counter added to the
  // report later should appear in the response automatically, while `decisions` — the
  // only field carrying identifiers — stays out by construction.
  const { decisions: _decisions, ...counters } = report
  return counters
}
