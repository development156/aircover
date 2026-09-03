import { autopilotEnabled } from '@/lib/cron/autopilot-enabled'
import { recordCronRun } from '@/lib/cron/heartbeat-store'
import { isAuthorizedCronRequest } from '@/lib/cron/authorize'
import { runAllAutopilotTicks } from '@/lib/loop/autopilot/tick-all'
import { reportServerError } from '@/lib/observability/report'

/**
 * THE AUTOPILOT TICK — announce what may go out, then send what is due.
 *
 * ── IT IS SCHEDULED NOW, AND THE FLAG IS WHAT STILL STOPS IT ─────────────────
 * `apps/web/vercel.json` schedules this route every ten minutes. That period comes
 * from the CANCEL WINDOW, not from how often there is work: a customer is
 * promised minutes to change their mind, and an hourly tick would let a post
 * sit past a five-minute window for fifty-five minutes and then send it, the
 * promise broken by the schedule rather than by any code.
 *
 * The schedule firing does NOT mean autopilot runs. `SAHODA_AUTOPILOT_ENABLED`
 * is absent in every environment, so every firing returns `enabled: false`
 * having done nothing. That flag is now the single deliberate act between this
 * code and unattended publishing, and it is deliberately a thing a person does
 * in a settings screen rather than anything a deploy can carry.
 *
 * A third gate exists without being a gate: `AutonomyLevelSchema` refuses to
 * write a 3 through the application, so no workspace can have an armed channel
 * today and the scan returns nothing. That is a property of the current data
 * and is NOT relied on — a flag is a decision somebody made, and "the query
 * happens to be empty" is not.
 *
 * ── WHY 300 SECONDS ──────────────────────────────────────────────────────────
 * The same figure the loop route settled on. Each workspace is a handful of
 * indexed reads and a few small writes with no model call in the path — the
 * gate check is passed in, not made here — so the cost is per-workspace round
 * trips rather than inference. The deadline exists because Vercel's default is
 * ten seconds and a tick torn down mid-loop leaves later workspaces unvisited
 * with nothing recording that they were skipped.
 */
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function GET(request: Request): Promise<Response> {
  if (
    !isAuthorizedCronRequest({
      header: request.headers.get('authorization'),
      secret: process.env.CRON_SECRET,
    })
  ) {
    return new Response('Unauthorized', { status: 401 })
  }

  // Read before any await, so the refusal costs nothing and cannot be mistaken
  // for a tick that ran and found no work. `enabled: false` is a different fact
  // from `workspaces: 0` and the response says which.
  // ── THE HEARTBEAT IS RECORDED BEFORE THE FLAG IS READ ─────────────────────
  // The heartbeat answers "did the schedule fire", which is true whether or not
  // the flag lets any work happen. Recording it only on the enabled path would
  // make a switched-off autopilot indistinguishable from a schedule that
  // stopped firing, and those need completely different responses: one is
  // correct, the other is an outage.
  await recordCronRun('autopilot').catch(() => {})

  if (!autopilotEnabled()) {
    return Response.json({ ok: true, enabled: false, reason: 'SAHODA_AUTOPILOT_ENABLED' })
  }

  try {
    const result = await runAllAutopilotTicks(new Date())
    return Response.json({ ok: true, enabled: true, ...result })
  } catch (error) {
    reportServerError(error, { action: 'cron.autopilot' })
    return Response.json({ ok: false, error: 'AUTOPILOT_CRON_FAILED' }, { status: 500 })
  }
}
