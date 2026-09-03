import { radarPassDeps, runRadarPass } from '@sahoda/jobs/radar'

import { isAuthorizedCronRequest } from '@/lib/cron/authorize'
import { recordCronRun } from '@/lib/cron/heartbeat-store'
import { radarScanEnabled } from '@/lib/cron/radar-enabled'
import { reportServerError } from '@/lib/observability/report'

/**
 * The weekly Radar pass, on a Vercel cron (see apps/web/vercel.json).
 *
 * ── WHY IT IS NOT ON TRIGGER.DEV, WHERE IT WAS WRITTEN FOR ──────────────────
 * `apps/jobs/src/trigger/radarScan.ts` exists and schedules nothing, because
 * apps/jobs has never been deployed to Trigger.dev — apps/jobs/CLAUDE.md says so
 * outright, and the sibling metric-capture route documents the measurement: the
 * `TRIGGER_SECRET_KEY` in this environment is a `tr_dev_` runtime key, which the
 * SDK uses to TALK to Trigger.dev, not the personal access token the deploy CLI
 * needs. Creating one is a founder action.
 *
 * So this route is what actually arms Radar. Adding the task file alone would
 * have looked exactly like arming it and collected nothing, forever, which is
 * the trap docs/24 already names: a migration applied, a job written, and
 * nothing running.
 *
 * ── WHY WEEKLY, AND WHY MONDAY ──────────────────────────────────────────────
 * Weekly is the cadence the product PROMISES. `/radar` tells the reader "one scan
 * per business per week" and prices it per scan, so a nightly pass would charge
 * seven times what the screen says it costs. `dueSources` is cadence-relative and
 * does the real filtering; this schedule only has to wake often enough that a
 * weekly source is never late and never so often that it pays twice.
 *
 * Monday 03:40 UTC because the change feed is something a shop owner reads at the
 * start of a week: the readings should be waiting, not arriving mid-week. The
 * minute is off the hour for the ordinary reason — every scheduler is busiest at
 * :00.
 *
 * Running LATE is safe (an unscanned source is simply more overdue and sorts
 * first next time). Running TWICE is nearly free: `dueSources` will not return a
 * source scanned an hour ago, and `insertChange` is `on conflict do nothing`, so
 * a duplicated delivery cannot double-write history. Vercel documents that cron
 * can both duplicate and miss deliveries, so both of those had to be true before
 * this could go on this rail at all.
 */

/** pg needs a real Node runtime; the Edge runtime cannot open a TCP socket to Postgres. */
export const runtime = 'nodejs'

/**
 * Opt out of static generation. Next executes a GET route handler with no dynamic
 * API during `next build`, which here would mean running a paid production pass
 * from a build machine — on every build.
 */
export const dynamic = 'force-dynamic'

/** The platform ceiling. */
export const maxDuration = 300

/**
 * How many due sources one pass looks at.
 *
 * A WALL, NOT A TARGET, and a wall-clock budget as much as a cost one: the pass
 * is sequential, a bought fetch is seconds, and everything has to finish inside
 * `maxDuration` above. Whatever does not fit is reported in `refused` rather than
 * dropped, and the next pass takes it first: the queue is ordered by the last
 * ATTEMPT, so whoever has waited longest since anyone last tried them goes first.
 *
 * It used to be ordered by the last SIGHTING, which is a different question. A
 * source that never loads is never seen, so it sorted first for ever and held
 * the whole weekly batch of 100 against everybody else.
 *
 * Stated HERE, next to the wall clock it has to fit inside, rather than left to
 * the deps default — the same reason the metrics route states its own.
 */
const BATCH = 100

export async function GET(request: Request): Promise<Response> {
  // FIRST STATEMENT IN THE HANDLER, AND IT MUST STAY FIRST. This route is
  // excluded from Clerk's middleware — it has to be, since Vercel cron does not
  // follow a redirect to /sign-in — so this check is the only thing in front of a
  // public endpoint that SPENDS MONEY. Anything above this line is reachable by
  // anyone, and here that means anyone could run up the bill.
  if (
    !isAuthorizedCronRequest({
      header: request.headers.get('authorization'),
      secret: process.env.CRON_SECRET,
    })
  ) {
    return new Response('Unauthorized', { status: 401 })
  }

  // Stamped BEFORE the enabled check, deliberately. The question the heartbeat
  // answers is "is the scheduler still calling this route", and a deliberately
  // disabled job is still being called. Stamping after the switch would make an
  // intentional pause indistinguishable from the schedule disappearing.
  await recordCronRun('radar')

  if (!radarScanEnabled()) {
    return Response.json({ ok: true, skipped: 'disabled' })
  }

  try {
    const report = await runRadarPass(radarPassDeps({ batch: BATCH }))
    // Counts and money only. No competitor id, no locator, no workspace id, no
    // page text — this body is returned on a public URL to whoever holds the cron
    // secret, and a locator is a customer's competitive intelligence about
    // themselves. `refused` carries source ids, so it is reported as a COUNT here
    // rather than passed through; the detail belongs in the run, not the response.
    return Response.json({
      ok: true,
      considered: report.considered,
      unchanged: report.unchanged,
      changed: report.changed,
      // Never folded into `unchanged`. "We could not check" and "nothing moved"
      // are the exact pair this whole feature exists to keep apart.
      couldNotCheck: report.couldNotCheck,
      refused: report.refused.length,
      snapshotsWritten: report.snapshotsWritten,
      changesWritten: report.changesWritten,
      freeCheckRate: report.freeCheckRate,
      // Split, never summed. Zyte reports cost nowhere, so an estimate added to a
      // measurement is not a total — it is a guess with a decimal point.
      spendMicros: report.spendMicros,
    })
  } catch (error) {
    reportServerError(error, { action: 'cron.radar' })
    // 500, not 200-with-an-error-field and not a 4xx. A pass that could not run is
    // an outage of this feature, and a week it silently fails is a week of changes
    // nobody can recover — the pages have already changed. A 4xx would describe it
    // as the caller's mistake and hide it from every 5xx filter; a 200 would hide
    // it from all of them.
    return new Response('radar pass failed', { status: 500 })
  }
}
