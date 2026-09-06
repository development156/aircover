import { createWithCredits } from '@sahoda/billing'

import { createRadarPgDb } from './radar/pg'
import { runRadarPass, type RadarPassOptions } from './radar/run'
import { getRuntime } from './runtime'

/**
 * RADAR'S ENTRY POINT FOR THE RUNNER THAT ACTUALLY EXISTS.
 *
 * ── WHY THIS FILE IS SEPARATE FROM `./trigger/radarScan.ts` ─────────────────
 * apps/jobs was written for Trigger.dev and has never been deployed there —
 * apps/jobs/CLAUDE.md states it plainly: "Nothing in here runs on Trigger.dev
 * today. No deploy has ever been made from this repo." So a `schedules.task` is
 * a description of an intended future, not a thing that runs, and scheduling
 * Radar there would have armed nothing at all while looking exactly like arming
 * it.
 *
 * The runner that demonstrably exists is a Vercel cron in apps/web. It imports
 * this module, which — like `./sweeps` and `./publish` — pulls NO Trigger.dev
 * SDK, because a Next.js route that imports the SDK drags a worker runtime into
 * a serverless function. The durable task wrapper stays in the tree beside it so
 * moving back is a wrapper swap in the other direction.
 *
 * ── WHAT THIS DELIBERATELY DOES NOT EXPORT ──────────────────────────────────
 * A way to pass `fetchPage`. That is the transport for the one UNTRUSTED address
 * in a pass — a URL a customer typed — and leaving it unset is what makes it take
 * its guarded default. Handing the raw global to both transports is the defect
 * that once made `http://169.254.169.254/` a fetchable competitor and this
 * server's own cloud credentials a snapshot row. A caller of this module cannot
 * reintroduce it by accident, because there is no argument here that would.
 */

export type { RadarPassReport } from './radar/run'

export interface RadarPassDepsOptions {
  /**
   * How many due sources one pass looks at. A WALL, NOT A TARGET: the cost of a
   * pass is bounded by this times the dearest rung of the ladder, and that is
   * the only bound there is. `dueSources` returns everything the cadence says is
   * ready, which after an outage is potentially every source at once.
   *
   * Sources past the wall are reported in `refused` rather than dropped, and the
   * next pass takes them first: the order is by the last ATTEMPT, so the ones
   * that waited longest go first and a source that keeps failing rotates to the
   * back rather than holding the batch for ever.
   */
  batch?: number
}

/**
 * Everything a pass needs, wired to this process's pool and env.
 *
 * A MISSING PROVIDER IS NOT A FAILURE, and that is why neither key is required.
 * `runRadarPass` records a source it cannot serve as a GAP — "we could not
 * check" — which is a state the Radar screen already draws, and a different
 * sentence from "nothing changed". An unprovisioned environment therefore spends
 * nothing and reports honestly, rather than throwing at boot.
 */
export function radarPassDeps(options: RadarPassDepsOptions = {}): RadarPassOptions {
  const { env, pool, ledger } = getRuntime()
  return {
    db: createRadarPgDb(pool),
    // THE CHARGE /radar PRINTS. "One scan per business per week, at 5 credits
    // each" was, until this line, a price nobody was debited: the pass tracked
    // Sahoda's provider cash in `radar_fetch_log` and reached no ledger at all.
    // The runtime's ledger port is the same one every sweep settles through, so
    // a Radar scan appears in the wallet beside everything else.
    withCredits: createWithCredits(ledger),
    // The PROVIDER transport only: Apify and Zyte, whose URLs this repository
    // writes. NOT the competitor's page — see the header.
    fetch: globalThis.fetch as never,
    // Spread rather than passed as `| undefined`, so an absent key and an
    // explicitly-undefined one stay the same thing under
    // `exactOptionalPropertyTypes`.
    ...(env.apifyToken ? { apifyToken: env.apifyToken } : {}),
    ...(env.tinyfishApiKey ? { tinyfishApiKey: env.tinyfishApiKey } : {}),
    ...(options.batch === undefined ? {} : { batch: options.batch }),
  }
}

export { runRadarPass }
export type { RadarPassOptions }
