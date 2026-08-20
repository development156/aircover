import 'server-only'

import type { CronJob } from './heartbeat'

/**
 * Where a cron tick leaves its trace: one Upstash key per job, holding the epoch
 * milliseconds of its last run.
 *
 * ## Why Redis and not a table
 *
 * A table would need a migration, and `packages/db/supabase/migrations` belongs
 * to `wt-db` alone. Upstash is already provisioned and already used over plain
 * `fetch` in `lib/ops/rate-limit.ts` — same idiom, no new dependency, and this
 * repo's lockfile has cost a production outage once already.
 *
 * It also happens to be the right shape. This is one number per job that is
 * overwritten forever and never queried historically. A row per tick would be
 * 288 rows a day of write-only noise.
 *
 * ## Both directions fail SOFT, and they fail to different answers
 *
 * `recordCronRun` never throws. A watchdog that can break the job it watches is
 * a worse bug than the one it detects, and a publishing sweep must not die
 * because a bookkeeping write timed out.
 *
 * `readCronRun` returns null when it cannot read — which the verdict function
 * reads as `unknown`, never as healthy. So an Upstash outage produces "we cannot
 * say", which is true, rather than "stopped", which would be a fabricated
 * failure, or silence, which would be the bug this whole module exists to close.
 *
 * ## The key is not namespaced by deployment, deliberately
 *
 * Preview deployments share these keys with production. That is wanted: the
 * question is "did the scheduled job run", and there is one scheduler. Scoping
 * per deployment would give every preview its own permanently-silent heartbeat
 * and drown the real one.
 */

const KEY_PREFIX = 'sahoda:cron:lastrun:'

/**
 * Long enough that expiry can never be mistaken for a stopped job.
 *
 * If the key expired at, say, twice the period, a job that stopped would first
 * read as `stopped` and then — once the key vanished — as `unknown`, which is a
 * weaker claim. The alarm would soften over time exactly as the outage got
 * worse. Thirty days outlives any outage anyone would still be diagnosing.
 */
const TTL_SECONDS = 30 * 24 * 60 * 60

function credentials(): { url: string; token: string } | null {
  const url = process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.UPSTASH_REDIS_REST_TOKEN
  if (!url || !token) return null
  return { url: url.replace(/\/$/, ''), token }
}

/**
 * Stamp "this job ran, now". Call it at the START of a tick, not the end: the
 * question is whether the scheduler is still calling us, and a run that begins
 * and then fails is an ERROR, which is already reported by other means. Stamping
 * only on success would conflate "not scheduled" with "scheduled and broken" —
 * the two things this module exists to keep apart.
 */
export async function recordCronRun(job: CronJob, nowMs: number = Date.now()): Promise<void> {
  const creds = credentials()
  if (creds === null) return

  try {
    await fetch(
      `${creds.url}/set/${encodeURIComponent(KEY_PREFIX + job)}/${nowMs}?EX=${TTL_SECONDS}`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${creds.token}` },
        cache: 'no-store',
      },
    )
  } catch {
    // Swallowed on purpose — see the header. The cost of a lost beat is one
    // false "unknown"; the cost of a throw here is the sweep itself.
  }
}

/** Epoch ms of the job's last recorded run, or null for "no trace or unreadable". */
export async function readCronRun(job: CronJob): Promise<number | null> {
  const creds = credentials()
  if (creds === null) return null

  try {
    const response = await fetch(`${creds.url}/get/${encodeURIComponent(KEY_PREFIX + job)}`, {
      headers: { Authorization: `Bearer ${creds.token}` },
      cache: 'no-store',
    })
    if (!response.ok) return null
    const body = (await response.json()) as { result?: unknown }
    // Upstash answers `{"result": null}` for a missing key and a STRING for a
    // present one. Number() on null is 0, which would read as 1 January 1970 —
    // an ancient but valid beat, i.e. "stopped" rather than "unknown". The
    // typeof check is what keeps a missing key honest.
    if (typeof body.result !== 'string') return null
    const parsed = Number(body.result)
    return Number.isFinite(parsed) ? parsed : null
  } catch {
    return null
  }
}
