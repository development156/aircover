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
    const result = await runScheduledLoopCycles()
    return Response.json({ ok: true, ...result })
  } catch (error) {
    reportServerError(error, { action: 'cron.loop' })
    // 200 with an error body, not a 500. Vercel retries a failing cron, and a
    // retry here would re-enter workspaces whose cycles already opened — the
    // one-live-cycle-per-week index makes that safe, but a retry storm on a
    // paid path is not something to invite.
    return Response.json({ ok: false, error: 'LOOP_CRON_FAILED' })
  }
}
