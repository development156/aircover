import {
  PublishQueueUnavailableError,
  dispatchSweepDeps,
  holdSweepDeps,
  runDispatchSweep,
  sweepExpiredHolds,
} from '@sahoda/jobs/sweeps'
import {
  publishPostDeps,
  reconcileSweepDeps,
  runClaimedPublish,
  runReconcileSweep,
} from '@sahoda/jobs/publish'
import { loadJobsEnv } from '@sahoda/jobs/sweeps'

import { checkAndAlertHeartbeats } from '@/lib/cron/alert'
import { isAuthorizedCronRequest } from '@/lib/cron/authorize'
import { recordCronRun } from '@/lib/cron/heartbeat-store'
import { publishFromCronEnabled } from '@/lib/cron/publish-enabled'
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
 * THIS ROUTE CAN NOW PUBLISH — behind SAHODA_PUBLISH_ENABLED, which is separate from
 * the dispatch mode ON PURPOSE. This release widens what
 * SAHODA_PUBLISH_DISPATCH_MODE=on means, from "classify and write statuses" to
 * "publish to real accounts", and nobody consented to the second meaning by setting
 * the first. Without the new flag the refusal below is exactly the old behaviour.
 *
 * It refused to publish for as long as there was no claim on
 * post_variants: Vercel documents that cron can both duplicate and miss deliveries, and
 * an inline publish with two overlapping invocations is two posts on someone's Instagram.
 * `runClaimedPublish` closes that — the claim is a single atomic UPDATE, so of two
 * overlapping ticks exactly one owns the variant and the other does nothing at all. The
 * publish happens inline because there is still no queue; the claim is what makes inline
 * safe, and it is the only thing that does.
 *
 * Work per tick is capped separately from the classification batch. Classifying 25 posts
 * costs three statements; PUBLISHING 25 would be 25 Instagram container polls at ~36s
 * each, which no serverless wall accommodates. Whatever does not fit is counted as
 * `deferred` and picked up by the next tick — never silently dropped.
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
 * The platform ceiling (300s on both Hobby and Pro with Fluid compute), and still inside
 * the five-minute cron interval so a tick cannot straddle the next one.
 *
 * Raised from 60 because this route publishes now. One Instagram publish is ~50s of
 * container polling and media upload; 60s could not fit a single one alongside the
 * sweeps. See PUBLISH_BATCH for how the number of publishes is bounded to match.
 */
export const maxDuration = 300

/**
 * How much work one tick takes on. Both candidate queries are oldest-first, so a backlog
 * drains across ticks instead of being attempted in one request. Sized so the worst case
 * — every row needing its guarded write — stays far under `maxDuration` even at the
 * cross-region latency between this function and the database.
 */
const DISPATCH_BATCH = 25
const HOLD_BATCH = 50

/**
 * How many variants one tick may actually publish.
 *
 * The binding constraint is wall-clock, not database work: an Instagram publish spends
 * ~36s polling for its live URL plus the media upload, so each one is ~50s. Four of them
 * is ~200s, which leaves room inside `maxDuration` for the classification pass and the
 * hold sweep with margin for a slow cold start.
 *
 * A backlog is not lost, it is DEFERRED: the claim is released or the variant is left
 * pending, `posts.scheduled_at` has not moved, and the next tick five minutes later
 * re-reads the same candidates oldest-first. The count is reported so a backlog is
 * visible rather than being mistaken for an idle queue.
 */
const PUBLISH_BATCH = 4

/**
 * How many rows the reconciliation pass re-checks per tick. Each one is a Zernio
 * request, so this is a request budget as much as a row budget. Oldest-checked
 * first, so a backlog drains across ticks rather than being attempted at once.
 */
const RECONCILE_BATCH = 15

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

  // ── THE TRACE, STAMPED BEFORE ANY WORK ────────────────────────────────────
  // At the START, not the end, and the distinction is the point: the question
  // this answers is whether the SCHEDULER is still calling us. A tick that
  // begins and then throws is an error, which Sentry already reports. Stamping
  // only on success would merge "not scheduled" into "scheduled and broken" —
  // the two things `lib/cron/heartbeat.ts` exists to keep apart. Never throws.
  await recordCronRun('sweeps')

  // This tick also checks its SIBLING. A watchdog inside the thing it watches
  // cannot survive that thing dying, so the crons cross-check: the five-minute
  // sweep is what notices that the nightly metrics pass has stopped. If the
  // whole scheduler stops, neither runs and only /admin/dev still says so.
  const heartbeats = await checkAndAlertHeartbeats()

  const outcome = await runCronSweeps({
    // Resolved HERE, from the running deployment's environment, so the answer is
    // measured rather than inferred. `loadJobsEnv()` applies the same default
    // (`fixture`) that `createAdapterSelector` will act on, so this reports the rail
    // the tick would actually publish through — not what the Vercel project intends.
    config: {
      publishMode: loadJobsEnv().publishMode,
      publishEnabled: publishFromCronEnabled(),
    },
    runDispatch: () =>
      (async () => {
        // One deps object for the whole tick: it holds the connection pool and the
        // Zernio client, and rebuilding it per variant would open a pool per publish.
        const canPublish = publishFromCronEnabled()
        // Built only when it will be used: publishPostDeps opens a Zernio client and
        // touches the pool, and a tick that cannot publish has no business doing either.
        const deps = canPublish ? publishPostDeps() : null
        let published = 0
        let deferred = 0

        const report = await runDispatchSweep({
          ...dispatchSweepDeps({ limit: DISPATCH_BATCH }),
          enqueuePublish: async (intent) => {
            if (!canPublish || deps === null) {
              // Exactly the pre-release behaviour: classified, counted under
              // queueUnavailable, and left precisely as it was.
              throw new PublishQueueUnavailableError()
            }
            if (published >= PUBLISH_BATCH) {
              deferred += 1
              return
            }
            published += 1
            // Errors are deliberately NOT caught here. A transient failure must
            // propagate so `runDispatchSweep` counts it and `runClaimedPublish` has
            // already handed the claim back — swallowing it would report a tick that
            // published nothing as a clean sweep.
            await runClaimedPublish(intent, { attempt: 1, jobRunId: `cron:${intent.postId}` }, deps)
          },
        })

        return { ...report, published, deferred }
      })(),
    runHolds: () => sweepExpiredHolds(holdSweepDeps({ limit: HOLD_BATCH })),
    // Asks Zernio what a webhook would have told us: which accounts have quietly
    // stopped working, and how a post that was still processing actually ended.
    // No receiver is built — doc 13's open question 6 (the signing scheme) is
    // still open, and an endpoint that cannot verify what it is sent would let
    // anyone who guesses the URL mark another customer's post published.
    runReconcile: () =>
      runReconcileSweep(
        reconcileSweepDeps({ mode: loadJobsEnv().reconcileMode, limit: RECONCILE_BATCH }),
      ),
    // The real error goes to Sentry; the response says only which sweep failed, because
    // a database error message can carry a connection string, a host or a query.
    onError: (scope, error) => reportServerError(error, { action: `cron:${scope}-sweep` }),
  })

  // The heartbeat verdicts ride the same body. Counts and job names only — no
  // workspace, no post, no customer text — because this body is returned on a
  // public URL to whoever holds the cron secret, the rule the rest of this
  // route already follows. Reporting what was FOUND and what was SENT
  // separately matters: "we saw a stopped job and mailed nobody" and "nothing
  // was wrong" would otherwise look identical from outside.
  return Response.json(
    {
      ...outcome.body,
      heartbeat: {
        states: heartbeats.checked.map((v) => `${v.job}:${v.state}`),
        alerted: heartbeats.sent,
        suppressed: heartbeats.suppressed,
      },
    },
    { status: outcome.status },
  )
}
