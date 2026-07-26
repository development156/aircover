import {
  PublishQueueUnavailableError,
  dispatchSweepDeps,
  holdSweepDeps,
  runDispatchSweep,
  sweepExpiredHolds,
} from '@sahoda/jobs/sweeps'

import { isAuthorizedCronRequest } from '@/lib/cron/authorize'
import { runCronSweeps } from '@/lib/cron/run-sweeps'
import { reportServerError } from '@/lib/observability/report'

/**
 * The scheduled sweeps, on a five-minute Vercel cron (see apps/web/vercel.json).
 *
 * apps/jobs was written for Trigger.dev and has never been deployed there — no CI, no
 * CLI, an unreconciled project-ref name, and an untested bundler story against raw-TS
 * workspace packages. This is the fallback apps/jobs/CLAUDE.md already sanctions, and it
 * is a wrapper swap rather than a rewrite because both job cores are free of that SDK.
 *
 * WHAT THIS DOES NOT DO: publish. `enqueuePublish` refuses in the open, because there is
 * no queue behind this route and no CAS claim on post_variants to make an inline publish
 * safe when two invocations overlap — and Vercel documents that cron can both duplicate
 * and miss deliveries. A due post is therefore classified, counted under
 * `queueUnavailable`, and left exactly as it was. Publishing stays disabled until that
 * claim exists.
 *
 * Both sweeps are behind their own flags and both default to `off`, so deploying this
 * route changes production behaviour by exactly nothing until a flag is flipped.
 */

/** pg needs a real Node runtime; the Edge runtime cannot open a TCP socket to Postgres. */
export const runtime = 'nodejs'

/**
 * Opt out of static generation. Next executes a GET route handler with no dynamic API
 * during `next build` — which here would mean running a production sweep from a build
 * machine. `force-dynamic` moves execution to request time, where it belongs.
 */
export const dynamic = 'force-dynamic'

/**
 * Well inside the platform ceiling (300s on both Hobby and Pro with Fluid compute) and
 * inside the cron interval. A wedged tick dies in one minute and the next tick re-reads
 * its candidates, rather than straddling five intervals while holding nothing useful.
 */
export const maxDuration = 60

/**
 * How much work one tick takes on. Both candidate queries are oldest-first, so a backlog
 * drains across ticks instead of being attempted in one request. Sized so the worst case
 * — every row needing its guarded write — stays far under `maxDuration` even at the
 * cross-region latency between this function and the database.
 */
const DISPATCH_BATCH = 25
const HOLD_BATCH = 50

export async function GET(request: Request): Promise<Response> {
  // FIRST STATEMENT IN THE HANDLER, AND IT MUST STAY FIRST. This route is excluded from
  // Clerk's middleware — it has to be, since an unauthenticated cron request would
  // otherwise be redirected to /sign-in and Vercel cron does not follow redirects — so
  // this check is the only thing in front of a public endpoint that mutates user data.
  // Anything above this line (a log, a query, an env read) becomes reachable by anyone.
  if (
    !isAuthorizedCronRequest({
      header: request.headers.get('authorization'),
      secret: process.env.CRON_SECRET,
    })
  ) {
    return new Response('Unauthorized', { status: 401 })
  }

  const outcome = await runCronSweeps({
    runDispatch: () =>
      runDispatchSweep({
        ...dispatchSweepDeps({ limit: DISPATCH_BATCH }),
        enqueuePublish: async () => {
          throw new PublishQueueUnavailableError()
        },
      }),
    runHolds: () => sweepExpiredHolds(holdSweepDeps({ limit: HOLD_BATCH })),
    // The real error goes to Sentry; the response says only which sweep failed, because
    // a database error message can carry a connection string, a host or a query.
    onError: (scope, error) => reportServerError(error, { action: `cron:${scope}-sweep` }),
  })

  return Response.json(outcome.body, { status: outcome.status })
}
