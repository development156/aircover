import { isAuthorizedCronRequest } from '@/lib/cron/authorize'
import { recordCronRun } from '@/lib/cron/heartbeat-store'
import { loopCronEnabled } from '@/lib/cron/loop-enabled'
import { runScheduledLoopCycles } from '@/lib/cron/run-loop'
import { reportServerError } from '@/lib/observability/report'

/**
 * THE SUNDAY PLAN — the Loop's weekly trigger, on a Vercel cron.
 *
 * ── WHY NOT TRIGGER.DEV, WHICH IS WHERE apps/jobs WAS WRITTEN FOR ────────────
 * MEASURED: the `TRIGGER_SECRET_KEY` in this environment is a `tr_dev_` runtime
 * key — what the SDK uses to TALK to Trigger.dev, not the personal access token
 * the deploy CLI needs — and `trigger.dev whoami` answers "You must login
 * first". apps/jobs has never been deployed there. Vercel cron is the runner
 * that demonstrably works: the publishing sweep and the nightly metric pass have
 * run from sibling routes for months.
 *
 * ── WHAT THIS ROUTE MAY DO, AND THE LINE IT STOPS AT ─────────────────────────
 * It runs collect, reflect and plan, and it STOPS at the cost preview. It does
 * not create, does not stage and cannot publish — the create stage is reached
 * only through `loop_approve_cost`, which requires a person's click and a JWT
 * this route does not have.
 *
 * That is the whole shape of the feature in one sentence: a cron may spend the
 * twenty credits it takes to think about your week, and a human decides whether
 * anything gets written.
 *
 * ── IT DEFAULTS OFF, UNLIKE THE METRICS ROUTE NEXT DOOR ──────────────────────
 * This one spends credits. See lib/cron/loop-enabled.ts for why the asymmetry is
 * deliberate rather than an inconsistency.
 */

/** pg needs a real Node runtime; the Edge runtime cannot open a TCP socket to Postgres. */
export const runtime = 'nodejs'

/**
 * Opt out of static generation. Next executes a GET route handler with no dynamic
 * API during `next build` — which here would mean starting production cycles, and
 * charging for them, from a build machine.
 */
export const dynamic = 'force-dynamic'

/**
 * The platform ceiling (300s on Hobby and on Pro with Fluid compute), and the
 * same number the metrics and sweeps crons use.
 *
 * ── IT HAD NONE, AND THE DEFAULT IS 10 SECONDS ───────────────────────────────
 * One workspace's cycle is a paid model call measured at 14 seconds. So without
 * this line the FIRST workspace could not finish: the function was torn down
 * mid-plan, after `openCycle` had written a row and possibly after the ledger had
 * taken a hold, leaving a cycle stuck in `planning` that no later tick will
 * reopen — the one-live-cycle-per-week index sees it and declines.
 *
 * ── 300 IS NOT ENOUGH FOR 40 WORKSPACES, AND THAT IS HANDLED, NOT IGNORED ────
 * 40 × 14s is 560s. A cap alone would mean workspaces 21 to 40 are silently
 * dropped by a timeout — reported as neither planned nor deferred, which reads
 * as "everyone was planned". `runScheduledLoopCycles` therefore watches the
 * clock and stops STARTING work it cannot finish, counting the rest as
 * `deferred`. The number below is what it is given.
 */
export const maxDuration = 300

/**
 * How much of `maxDuration` is left unused, so the response is still written.
 *
 * Being killed while serialising the result loses the whole report — including
 * which workspaces were deferred, which is the part a person needs in order to
 * know the tick was truncated at all.
 */
const SAFETY_MARGIN_SECONDS = 20

export async function GET(request: Request): Promise<Response> {
  if (
    !isAuthorizedCronRequest({
      header: request.headers.get('authorization'),
      secret: process.env.CRON_SECRET,
    })
  ) {
    return new Response('Unauthorized', { status: 401 })
  }

  // Recorded BEFORE the work, and outside the try: the heartbeat answers "did
  // the schedule fire", which is true whether or not the work succeeded. Writing
  // it only on success would make a failing job indistinguishable from a
  // schedule that stopped firing, and those need different responses.
  await recordCronRun('loop').catch(() => {})

  if (!loopCronEnabled()) {
    return Response.json({ ok: true, skipped: 'SAHODA_LOOP_CRON_MODE is not "on"' })
  }

  try {
    // The route owns the clock, because the route is what Vercel kills.
    const result = await runScheduledLoopCycles(new Date(), {
      deadline: Date.now() + (maxDuration - SAFETY_MARGIN_SECONDS) * 1000,
    })
    return Response.json({ ok: true, ...result })
  } catch (error) {
    reportServerError(error, { action: 'cron.loop' })
    // 500, the same as the metrics, radar and autopilot siblings, and for the
    // reason metrics states next door: a 4xx would call it the caller's mistake
    // and a 200 would hide it from Vercel's cron log, from every 5xx filter and
    // from every alert built on either. That mattered here more than anywhere,
    // because the heartbeat above is stamped BEFORE the work, so a pass that
    // fires and throws still reads as alive on the ops surface.
    //
    // This said "200, because Vercel retries a failing cron". Vercel's cron
    // documentation describes no automatic retry, so the retry storm the 200
    // avoided was never on the table; and the one-live-cycle-per-week index
    // makes a re-entry safe anyway, which the old comment said itself.
    return Response.json({ ok: false, error: 'LOOP_CRON_FAILED' }, { status: 500 })
  }
}
