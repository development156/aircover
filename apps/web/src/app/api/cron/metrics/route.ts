import { metricCaptureDeps, runMetricCapture } from '@sahoda/jobs/publish'

import { isAuthorizedCronRequest } from '@/lib/cron/authorize'
import { metricCaptureEnabled } from '@/lib/cron/metrics-enabled'
import { reportServerError } from '@/lib/observability/report'

/**
 * The nightly metric-history pass, on a daily Vercel cron (see apps/web/vercel.json).
 *
 * ── WHY IT IS NOT ON TRIGGER.DEV, WHICH IS WHERE IT WAS WRITTEN FOR ──────────
 * apps/jobs was written for Trigger.dev and has never been deployed there.
 * MEASURED 2026-08-19: `trigger.dev whoami` answers "You must login first" — the
 * `TRIGGER_SECRET_KEY` in this environment is a `tr_dev_` runtime key, which the
 * SDK uses to TALK to Trigger.dev, not a personal access token, which is what the
 * deploy CLI requires. Creating one is a founder action.
 *
 * So this is the fallback apps/jobs/CLAUDE.md already sanctions, and it is the
 * runner that demonstrably exists: the two sweeps have run from a sibling route
 * for months. `runMetricCapture` is free of the Trigger.dev SDK, which is what
 * makes this a wrapper swap rather than a rewrite — and the durable task wrapper
 * stays in the tree, so moving back is the same swap in reverse.
 *
 * ── WHY IT IS ITS OWN ROUTE AND NOT PART OF THE FIVE-MINUTE TICK ─────────────
 * The table it writes is keyed by DAY. Riding the five-minute sweep would spend
 * one Zernio request per published channel, 288 times a day, to write nothing on
 * 287 of them. Once a day collects the same history for 1/288th of the budget.
 *
 * ── WHAT IT CANNOT DO ────────────────────────────────────────────────────────
 * Publish, reply, charge, or change a post. It reads analytics and appends rows to
 * a table that refuses updates from everyone, this job included. That is why its
 * switch defaults to ON while every other sweep defaults to OFF — see
 * `metrics-enabled.ts`.
 */

/** pg needs a real Node runtime; the Edge runtime cannot open a TCP socket to Postgres. */
export const runtime = 'nodejs'

/**
 * Opt out of static generation. Next executes a GET route handler with no dynamic
 * API during `next build`, which here would mean running a production pass from a
 * build machine.
 */
export const dynamic = 'force-dynamic'

/** The platform ceiling. One request per target, four at a time, bounded by BATCH. */
export const maxDuration = 300

/**
 * How many published channels one nightly pass asks about.
 *
 * A request budget as much as a row budget: Zernio rate-limits at 60/min, and each
 * target is one call. Oldest-published first, so a backlog drains across nights
 * rather than starving the same posts every time. Deliberately below the store's
 * own default so the ceiling that matters is stated HERE, next to the wall clock
 * it has to fit inside.
 */
const BATCH = 120

export async function GET(request: Request): Promise<Response> {
  // FIRST STATEMENT IN THE HANDLER, AND IT MUST STAY FIRST. This route is excluded
  // from Clerk's middleware — it has to be, since Vercel cron does not follow the
  // redirect to /sign-in — so this check is the only thing in front of a public
  // endpoint that writes to customer data. Anything above this line is reachable
  // by anyone.
  if (
    !isAuthorizedCronRequest({
      header: request.headers.get('authorization'),
      secret: process.env.CRON_SECRET,
    })
  ) {
    return new Response('Unauthorized', { status: 401 })
  }

  if (!metricCaptureEnabled()) {
    return Response.json({ ok: true, skipped: 'disabled' })
  }

  try {
    const report = await runMetricCapture(metricCaptureDeps({ limit: BATCH }))
    // Counts and one timestamp. No post id, no workspace id, no customer text —
    // this body is returned on a public URL to whoever holds the cron secret, and
    // the same rule the sweeps route follows applies here.
    return Response.json({ ok: true, ...report })
  } catch (error) {
    reportServerError(error, { action: 'cron.metrics' })
    // ── 500, NOT 200-WITH-AN-ERROR-FIELD, AND NOT A 4xx ──────────────────────
    // A pass that could not run is an outage of this feature, and every day it
    // silently fails is a day of history nobody can recover. A 4xx would describe
    // it as the caller's mistake and hide it from every 5xx filter; a 200 would
    // hide it from all of them.
    return new Response('metric capture failed', { status: 500 })
  }
}
