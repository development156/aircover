import 'server-only'
import type { DispatchSweepReport, HoldSweepReport } from '@sahoda/jobs/sweeps'

/** What went wrong, named but never described — the detail goes to the log, not the wire. */
interface SweepError {
  error: 'dispatch-sweep-failed' | 'hold-sweep-failed'
}

/** The dispatch report minus `decisions`, which carries post and workspace ids. */
type DispatchCounters = Omit<DispatchSweepReport, 'decisions'>

export interface CronSweepBody {
  ok: boolean
  dispatch: DispatchCounters | SweepError
  holds: HoldSweepReport | SweepError
}

export interface CronSweepOutcome {
  status: number
  body: CronSweepBody
}

export interface CronSweepRunners {
  runDispatch(): Promise<DispatchSweepReport>
  runHolds(): Promise<HoldSweepReport>
  /** Receives the real error so the route can log it. Never reached by the response. */
  onError?(scope: 'dispatch' | 'holds', error: unknown): void
}

/**
 * One cron tick: run both scheduled sweeps and describe what happened in counters.
 *
 * Two rules shape the response. First, the sweeps are independent — a dispatcher failure
 * must not stop the hold reaper, because stranded credits are the user's money and the
 * two share a request, not a fate. Second, the body crosses a public URL, so it carries
 * counts only: `decisions` is dropped whole rather than filtered, and a failure is named
 * (`dispatch-sweep-failed`) rather than described, since a database error message can
 * carry a connection string, a host or a query.
 *
 * A failed sweep answers 500 so a broken tick shows up as an error in the cron dashboard
 * instead of a green run that quietly did nothing. Vercel does not retry a failed
 * invocation; the next tick is the retry, and both sweeps re-read their candidates.
 */
export async function runCronSweeps(runners: CronSweepRunners): Promise<CronSweepOutcome> {
  const dispatch = await attempt('dispatch', runners.runDispatch, runners.onError)
  const holds = await attempt('holds', runners.runHolds, runners.onError)

  const ok = !isError(dispatch) && !isError(holds)

  return {
    status: ok ? 200 : 500,
    body: {
      ok,
      dispatch: isError(dispatch) ? dispatch : stripDecisions(dispatch),
      holds,
    },
  }
}

async function attempt<T>(
  scope: 'dispatch' | 'holds',
  run: () => Promise<T>,
  onError: CronSweepRunners['onError'],
): Promise<T | SweepError> {
  try {
    return await run()
  } catch (e) {
    onError?.(scope, e)
    return { error: scope === 'dispatch' ? 'dispatch-sweep-failed' : 'hold-sweep-failed' }
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
