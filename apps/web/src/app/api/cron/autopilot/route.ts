import { autopilotEnabled } from '@/lib/cron/autopilot-enabled'
import { isAuthorizedCronRequest } from '@/lib/cron/authorize'
import { runAllAutopilotTicks } from '@/lib/loop/autopilot/tick-all'
import { reportServerError } from '@/lib/observability/report'

/**
 * THE AUTOPILOT TICK — announce what may go out, then send what is due.
 *
 * ── THIS ROUTE IS NOT SCHEDULED, AND THAT IS THE SECOND GATE ─────────────────
 * `apps/web/vercel.json` lists six crons and this is not one of them. Adding it
 * is a separate, deliberate act by a person, on top of setting
 * SAHODA_AUTOPILOT_ENABLED. Two independent gates, because the thing behind
 * them is Sahoda posting to a customer's account with nobody watching, and one
 * switch is one mistake away from being flipped by somebody who did not read
 * what it meant.
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
  if (!autopilotEnabled()) {
    return Response.json({ ok: true, enabled: false, reason: 'SAHODA_AUTOPILOT_ENABLED' })
  }

  // ── NO HEARTBEAT, AND THE ABSENCE IS THE HONEST CHOICE ────────────────────
  // Every sibling route records one, and each is right to: the heartbeat
  // answers "did the schedule fire". This route HAS no schedule — it is not in
  // vercel.json — so there is no firing to miss.
  //
  // Recording one would mean adding `autopilot` to `CronJob`, which forces an
  // entry in `CRON_SCHEDULES`, which requires a `periodMs`. There is no period.
  // Inventing one makes `checkAndAlertHeartbeats` page somebody because a job
  // that was never scheduled did not run — an alarm about a fiction.
  //
  // Whoever adds this route to vercel.json must add its schedule to
  // CRON_SCHEDULES and this heartbeat in the SAME change. The two halves are
  // one decision and splitting them is how a job ends up unmonitored.

  try {
    const result = await runAllAutopilotTicks(new Date())
    return Response.json({ ok: true, enabled: true, ...result })
  } catch (error) {
    reportServerError(error, { action: 'cron.autopilot' })
    return Response.json({ ok: false, error: 'AUTOPILOT_CRON_FAILED' }, { status: 500 })
  }
}
