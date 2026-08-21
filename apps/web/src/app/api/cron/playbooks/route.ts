import { isAuthorizedCronRequest } from '@/lib/cron/authorize'
import { recordCronRun } from '@/lib/cron/heartbeat-store'
import { playbooksCronEnabled } from '@/lib/cron/playbooks-enabled'
import { runScheduledPlaybooks } from '@/lib/cron/run-playbooks'
import { reportServerError } from '@/lib/observability/report'

/**
 * THE DAILY TICK — the Playbooks schedule trigger.
 *
 * ── WHY NOT TRIGGER.DEV, WHICH IS WHERE apps/jobs WAS WRITTEN FOR ────────────
 * MEASURED: the `TRIGGER_SECRET_KEY` in this environment is a `tr_dev_` runtime
 * key — what the SDK uses to TALK to Trigger.dev, not the personal access token
 * the deploy CLI needs — and `trigger.dev whoami` answers "You must login
 * first". apps/jobs has never been deployed there. This route is the runner that
 * demonstrably works: the publishing sweep, the nightly metric pass and the
 * Sunday Loop plan have run from sibling routes for months.
 *
 * ── WHAT THIS ROUTE MAY DO, AND THE LINE IT STOPS AT ─────────────────────────
 * It opens runs, reads a calendar and prices what it found, and it STOPS at the
 * cost preview. It does not draft, does not stage and cannot publish — the paid
 * half is reached only through `playbook_approve_cost`, which requires a
 * person's click and a JWT this route does not have.
 *
 * That is the whole shape of the feature in one sentence: a schedule may notice
 * that Diwali is coming, and a human decides whether anything gets written.
 *
 * ── IT DEFAULTS OFF, UNLIKE THE METRICS ROUTE NEXT DOOR ──────────────────────
 * See lib/cron/playbooks-enabled.ts for why the asymmetry is deliberate.
 */

/** pg needs a real Node runtime; the Edge runtime cannot open a TCP socket to Postgres. */
export const runtime = 'nodejs'

/**
 * Opt out of static generation. Next executes a GET route handler with no dynamic
 * API during `next build` — which here would mean opening production runs from a
 * build machine.
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

  // Recorded BEFORE the work, and outside the try: the heartbeat answers "did the
  // schedule fire", which is true whether or not the work succeeded. Writing it
  // only on success would make a failing job indistinguishable from a schedule
  // that stopped firing, and those need different responses.
  await recordCronRun('playbooks').catch(() => {})

  if (!playbooksCronEnabled()) {
    return Response.json({ ok: true, skipped: 'SAHODA_PLAYBOOKS_CRON_MODE is not "on"' })
  }

  try {
    const result = await runScheduledPlaybooks()
    return Response.json({ ok: true, ...result })
  } catch (error) {
    reportServerError(error, { action: 'cron.playbooks' })
    // 200 with an error body, not a 500. Vercel retries a failing cron, and a
    // retry here would re-enter playbooks whose runs already opened — the
    // one-live-run index makes that safe, but a retry storm is not something to
    // invite.
    return Response.json({ ok: false, error: 'PLAYBOOKS_CRON_FAILED' })
  }
}
