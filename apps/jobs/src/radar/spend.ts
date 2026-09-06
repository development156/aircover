/**
 * RADAR'S SPENDING GATE.
 *
 * Radar is the first thing in this product that spends real money in a loop with
 * no human in it. A publish costs credits a customer already bought; a Radar
 * fetch costs cash, on our card, every night, forever. A bug that fetches in a
 * circle here does not fail loudly — it succeeds, repeatedly, and the first
 * signal is an invoice.
 *
 * ── THE ONE PROPERTY THIS FILE EXISTS TO GUARANTEE ───────────────────────────
 * WHEN THE CAP REFUSES, THE PROVIDER IS NEVER CALLED.
 *
 * Not "an error is raised afterwards" — that is a cap that pays and then
 * complains. The provider call lives INSIDE the callback below, and on a refusal
 * the callback is never invoked at all. That is the whole design, and it is what
 * `spend.test.ts` asserts by counting calls on a transport that records them:
 * `expect(transport.calls).toBe(0)`, printed, not merely "it threw".
 *
 * ── WHAT THIS FILE CANNOT DO, STATED PLAINLY ─────────────────────────────────
 * It cannot make two simultaneous runners safe. `app.radar_begin_fetch` adds up
 * today's spending and writes a reservation inside one transaction, holding an
 * advisory lock — so two callers in the same database serialise. But the lock
 * ends with the transaction and the HTTP request happens after it. What actually
 * keeps runners from overlapping is the workflow's `concurrency: group`, in
 * .github/workflows/radar-nightly.yml, and nothing in this file should be read as
 * a substitute for it.
 */
import type { RadarDb } from './db'

/** What a check is expected to cost, before it is made. */
export interface SpendRequest {
  sourceId: string
  mode: 'cheap' | 'render'
  provider: 'direct' | 'tinyfish' | 'apify'
  estimateMicros: number
  /**
   * Whether the number above can ever become a measurement.
   *
   * MEASURED 2026-08-22: Apify reports `usageTotalUsd` on the run, so an Apify row
   * settles to what Apify says it charged. Zyte reports cost nowhere — not in the
   * body, not in a header, and /v1/stats, /v1/usage and the app usage path all
   * answer 404 — so a Zyte row can only ever carry a list price. Saying which is
   * which is the difference between a cost report and a guess with a total.
   */
  costBasis: 'measured' | 'estimated' | 'free'
}

/** What the check turned out to be, once it had been made. */
export interface SpendOutcome<T> {
  outcome: 'unchanged' | 'changed' | 'could_not_check'
  /** What it really cost. For an 'estimated' basis this stays the list price. */
  costMicros: number
  costBasis?: 'measured' | 'estimated' | 'free'
  /**
   * Why, in the checker's own words — 'http 403', 'challenge: cloudflare
   * interstitial', 'transport: TimeoutError'. Never flattened to "failed": the
   * difference between a bot wall and a timeout decides whether escalating to a
   * paid fetch would even help.
   */
  detail?: Record<string, unknown>
  value: T
}

export interface Refusal {
  spent: false
  reason: 'DAILY_CAP' | 'WORKSPACE_CAP' | 'NO_SUBSCRIBERS'
  /** The numbers behind the refusal, so the screen can say more than "stopped". */
  spentMicros?: number
  capMicros?: number
  workspaceId?: string
}

export type SpendResult<T> = Refusal | { spent: true; value: T; reservationId: string }

export function isRefusal<T>(r: SpendResult<T>): r is Refusal {
  return r.spent === false
}

/**
 * Ask the database for permission, then — only if it agrees — do the thing.
 *
 * A REFUSAL IS NOT AN ERROR. Reaching a spending cap is a normal operating
 * condition, like a schedule being empty: the runner records it, the screen says
 * "we stopped checking today and here is why", and the pass carries on with the
 * sources it can still afford. Throwing would take down the whole night's
 * collection because one competitor's page was expensive.
 */
export async function withSpend<T>(
  db: RadarDb,
  request: SpendRequest,
  call: (ctx: { reservationId: string; subscriberCount: number }) => Promise<SpendOutcome<T>>,
): Promise<SpendResult<T>> {
  const permission = await db.beginFetch(request)

  if (!permission.allowed) {
    return {
      spent: false,
      reason: permission.reason,
      ...(permission.spentMicros === undefined ? {} : { spentMicros: permission.spentMicros }),
      ...(permission.capMicros === undefined ? {} : { capMicros: permission.capMicros }),
      ...(permission.workspaceId === undefined ? {} : { workspaceId: permission.workspaceId }),
    }
  }

  const ctx = {
    reservationId: permission.reservationId,
    subscriberCount: permission.subscriberCount,
  }

  let result: SpendOutcome<T>
  try {
    result = await call(ctx)
  } catch (error) {
    // The request went out and something went wrong afterwards. The reservation
    // MUST still be settled: leaving it 'pending' would keep its estimate counted
    // against the cap forever, and by tomorrow a handful of crashes would have
    // wedged the whole feature shut. Settled at the ESTIMATE, not at zero —
    // a request that failed late has very likely already been charged.
    await db.finishFetch({
      reservationId: ctx.reservationId,
      outcome: 'could_not_check',
      costMicros: request.estimateMicros,
      costBasis: request.costBasis,
      detail: { error: error instanceof Error ? `${error.name}: ${error.message}` : String(error) },
    })
    throw error
  }

  await db.finishFetch({
    reservationId: ctx.reservationId,
    outcome: result.outcome,
    costMicros: result.costMicros,
    costBasis: result.costBasis ?? request.costBasis,
    detail: result.detail ?? {},
  })

  return { spent: true, value: result.value, reservationId: ctx.reservationId }
}
