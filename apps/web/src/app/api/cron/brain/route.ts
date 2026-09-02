import { isAuthorizedCronRequest } from '@/lib/cron/authorize'
import { recordCronRun } from '@/lib/cron/heartbeat-store'
import { runMarketingBrainPass } from '@/lib/brain/run'
import { reportServerError } from '@/lib/observability/report'

/**
 * THE MARKETING BRAIN'S WEEKLY PASS, on a Vercel cron.
 *
 * ── WHY IT IS ITS OWN ROUTE AND NOT PART OF THE SUNDAY LOOP TICK ─────────────
 * The Loop's route buys model calls, so it defaults OFF behind
 * `SAHODA_LOOP_CRON_MODE` and a person has to turn it on. This pass spends
 * nothing: it counts characters in captions the customer already published and
 * appends rows to a table no client can write. Riding the Loop's route would tie
 * a free computation to a paid switch, and the first workspace to leave the Loop
 * off would silently get no Marketing Brain either with nothing on any screen
 * saying why.
 *
 * It runs half an hour after the Loop rather than at the same minute so the two
 * are not competing for the same function concurrency on the one evening they
 * both fire.
 *
 * ── WHAT IT CANNOT DO ────────────────────────────────────────────────────────
 * Publish, reply, charge, call a model, or change a post. It reads published
 * captions and writes observations. There is no switch to default OFF here for
 * the same reason the metrics route has none in that direction: the cost of
 * running when it should not have is some bounded reads, and the cost of not
 * running is a week of a customer's history that nothing says is missing.
 */

/** pg needs a real Node runtime; the Edge runtime cannot open a TCP socket to Postgres. */
export const runtime = 'nodejs'

/**
 * Opt out of static generation. Next executes a GET route handler with no dynamic
 * API during `next build`, which here would mean running a production pass from a
 * build machine.
 */
export const dynamic = 'force-dynamic'

/** The platform ceiling, and the same number the three sibling crons use. */
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

  // Before the work and outside the try, as the sibling routes do: the heartbeat
  // answers "did the schedule fire", which is true whether or not the work
  // succeeded. Writing it only on success makes a failing job indistinguishable
  // from a schedule that stopped firing, and those need different responses.
  await recordCronRun('brain').catch(() => {})

  try {
    const result = await runMarketingBrainPass(new Date())
    return Response.json({ ok: true, ...result })
  } catch (error) {
    reportServerError(error, { action: 'cron.brain' })
    // 500, matching the metrics, radar and autopilot siblings: a 200 here hid a
    // broken weekly pass from Vercel's cron log and from every 5xx filter, while
    // the heartbeat above (stamped before the work) still read as alive.
    //
    // This said "200, because Vercel retries a failing cron". Vercel documents
    // no automatic retry for a cron invocation, and the upsert makes a re-entry
    // harmless in any case.
    return Response.json({ ok: false, error: 'BRAIN_CRON_FAILED' }, { status: 500 })
  }
}
