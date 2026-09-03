import { schedules } from '@trigger.dev/sdk'
import { createWithCredits } from '@sahoda/billing'

import { createRadarPgDb } from '../radar/pg'
import { runRadarPass, type RadarPassReport } from '../radar/run'
import { getRuntime } from '../runtime'

export const RADAR_SCAN_TASK_ID = 'radar-scan'

/**
 * How many sources one pass will look at, whatever is due.
 *
 * A WALL, NOT A TARGET. The cost of a night is bounded by this number times the
 * dearest rung of the ladder, and that is the only bound there is — `dueSources`
 * returns everything the cadence says is ready, which after an outage could be
 * every source in the table at once. 100 is the same figure the manual script
 * uses; sources past the wall are reported in `refused` rather than dropped, and
 * tomorrow's pass takes them (the order is by the last ATTEMPT, so the ones that
 * waited longest go first).
 */
const BATCH = 100

/**
 * ONE RADAR PASS A WEEK, EARLY MONDAY UTC.
 *
 * ── THIS TASK IS ARMED, AND THAT IS A DEPARTURE ─────────────────────────────
 * Every other sweep in `env.ts` carries a MODE that defaults to `off`, each with
 * a note saying that deploying it must not, by itself, start doing things.
 * This one has no such flag: it is scheduled, and the first run after a deploy
 * will spend money.
 *
 * Founder's ruling, 2026-08-25, taken with the cost stated: "wire it and arm it
 * now". Recorded here rather than absorbed, because the convention it departs
 * from is written down four times in the file next door and the next person to
 * read this is owed the reason.
 *
 * WHAT ACTUALLY SPENDS, so the exposure is legible rather than implied:
 *
 *   · A WEBSITE source normally costs NOTHING. The first rung is a conditional
 *     GET from our own server; a 304, or the same content hash, ends the night
 *     for that source. Zyte is bought only for a page we could not see at all —
 *     a bot wall, a 403, a JavaScript shell.
 *   · AN INSTAGRAM source always costs. No platform shows a stranger's account
 *     to a plain HTTP request, so for social the check IS the purchase. Social
 *     is substantially the whole bill.
 *   · With `APIFY_TOKEN` or `ZYTE_API_KEY` absent, the sources that would need
 *     them are recorded as GAPS and nothing is bought. An unprovisioned
 *     environment therefore costs nothing rather than failing.
 *
 * ── WHY WEEKLY, AND WHY MONDAY ──────────────────────────────────────────────
 * Weekly is the cadence the product PROMISES — `/radar` tells the reader "one
 * scan per business per week" and prices it per scan — so a nightly pass would
 * charge seven times what the screen says. `dueSources` is cadence-relative and
 * does the real filtering; this schedule only has to wake often enough that a
 * weekly source is never late, and never so often that it pays twice.
 *
 * Monday 03:40 UTC: the change feed is something a shop owner reads at the start
 * of a week, so the readings should be waiting rather than arriving mid-week. The
 * minute is off the hour for the ordinary reason — every scheduler in the world
 * is busiest at :00.
 *
 * A pass ALSO CHARGES THE CUSTOMER: `radar_scan` at the price /radar prints,
 * once per watching workspace per competitor per ISO week. A page that will not
 * load is held for and then released, so a gap costs nobody anything.
 *
 * Running LATE is safe: a source not scanned this week is simply more overdue and
 * sorts first next time. Running TWICE is nearly free: `dueSources` will not
 * return a source scanned an hour ago, and `insertChange` is
 * `on conflict do nothing`, so a duplicated pass cannot double-write history.
 *
 * ── WHAT THIS WRAPPER DELIBERATELY DOES NOT DO ──────────────────────────────
 * It does not pass `fetchPage`. That is the transport for the one UNTRUSTED
 * address in the pass — a URL a customer typed — and omitting it is what makes
 * it take its guarded default. Handing the raw global to both transports is the
 * defect that made `http://169.254.169.254/` a fetchable competitor and this
 * server's own cloud credentials a snapshot row. `fetch` below is the PROVIDER
 * transport only: Apify and Zyte, whose URLs this repository writes.
 *
 * All behaviour is in `runRadarPass`, which imports no scheduler SDK, so it stays
 * testable and the sanctioned Vercel-cron + QStash fallback remains a wrapper
 * swap.
 */
export const radarScanTask = schedules.task({
  id: RADAR_SCAN_TASK_ID,
  cron: '40 3 * * 1',
  run: async (): Promise<RadarPassReport> => {
    const { env, pool, ledger } = getRuntime()
    return runRadarPass({
      db: createRadarPgDb(pool),
      // The customer's 5 credits a scan. Held before the read and released on a
      // page that would not load — see `radar/charge.ts`.
      withCredits: createWithCredits(ledger),
      // The PROVIDER transport. NOT the competitor's page — see the header.
      fetch: globalThis.fetch as never,
      // Spread rather than passed as `| undefined`: an explicitly-undefined key
      // and an absent one are the same to `runRadarPass`, but the spread keeps
      // that true under `exactOptionalPropertyTypes`.
      ...(env.apifyToken ? { apifyToken: env.apifyToken } : {}),
      ...(env.zyteApiKey ? { zyteApiKey: env.zyteApiKey } : {}),
      batch: BATCH,
    })
  },
})
