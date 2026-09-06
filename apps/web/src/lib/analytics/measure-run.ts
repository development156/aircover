import 'server-only'

import type { MeasureRun } from './measure-copy'

/**
 * WHEN SAHODA LAST ASKED THE PLATFORMS FOR THIS WORKSPACE'S NUMBERS.
 *
 * One Upstash key per workspace, holding epoch milliseconds. Same idiom as
 * `lib/cron/heartbeat-store.ts` and for the same two reasons: a table would need
 * a migration, and `packages/db/supabase/migrations` belongs to `wt-db` alone.
 * The shape fits too — one number per workspace, overwritten forever, never
 * queried historically.
 *
 * ── THREE ANSWERS, NOT TWO, AND THAT IS THE WHOLE POINT ──────────────────────
 * `readCronRun` folds "no trace" and "unreadable" into one null, which is right
 * for a watchdog whose verdict function reads null as "we cannot say". It is
 * WRONG here, because the value is printed at a customer: "Not measured yet" is
 * a claim about their workspace, and making it out of a failed Upstash request
 * is the same defect as an empty list rendered as "nobody enquired". So a
 * successful read of a missing key answers `never`, a failed read answers
 * `unknown`, and the two get different sentences.
 *
 * ── IT IS NOT WHEN THE FIGURES WERE MEASURED ─────────────────────────────────
 * This is when the PASS RAN. The figures themselves carry `measured_on`, which
 * is the platform's own stamp and is what the report prints under the live
 * module. A pass that ran a minute ago can still be showing yesterday's
 * readings, because that is all the platform had — so the two are two sentences
 * and never one.
 */

const KEY_PREFIX = 'sahoda:measure:lastrun:'

/** Thirty days, matching the heartbeat: long enough that expiry is never news. */
const TTL_SECONDS = 30 * 24 * 60 * 60

/** How long a workspace must wait between two manual passes. */
export const MEASURE_COOLDOWN_MS = 10 * 60 * 1000

/**
 * How many live posts one manual pass reads. Same ceiling as the nightly
 * `api/cron/metrics` BATCH: a workspace with more than this has the nightly
 * sweep for the rest, and the button never runs longer than the cron does.
 */
export const MEASURE_BATCH = 120

function credentials(): { url: string; token: string } | null {
  const url = process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.UPSTASH_REDIS_REST_TOKEN
  if (!url || !token) return null
  return { url: url.replace(/\/$/, ''), token }
}

/** Stamp "this workspace measured, now". Never throws: a lost stamp is not a lost pass. */
export async function recordMeasureRun(
  workspaceId: string,
  nowMs: number = Date.now(),
): Promise<void> {
  const creds = credentials()
  if (creds === null) return
  try {
    await fetch(
      `${creds.url}/set/${encodeURIComponent(KEY_PREFIX + workspaceId)}/${nowMs}?EX=${TTL_SECONDS}`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${creds.token}` },
        cache: 'no-store',
      },
    )
  } catch {
    // Swallowed. The cost of a lost stamp is one honest "cannot say"; the cost
    // of a throw here would be a completed measurement reported as a failure.
  }
}

/** When this workspace last measured, or which kind of "we do not know" it is. */
export async function readMeasureRun(workspaceId: string): Promise<MeasureRun> {
  const creds = credentials()
  // No limiter provisioned is not "never measured". It is us not being able to
  // look, which is exactly the distinction this type exists for.
  if (creds === null) return { kind: 'unknown' }

  try {
    const response = await fetch(
      `${creds.url}/get/${encodeURIComponent(KEY_PREFIX + workspaceId)}`,
      {
        headers: { Authorization: `Bearer ${creds.token}` },
        cache: 'no-store',
      },
    )
    if (!response.ok) return { kind: 'unknown' }
    const body = (await response.json()) as { result?: unknown }
    // Upstash answers `{"result": null}` for a missing key and a STRING for a
    // present one. A successful read of a missing key is the ONE case that has
    // earned the word "never".
    if (body.result === null) return { kind: 'never' }
    if (typeof body.result !== 'string') return { kind: 'unknown' }
    const parsed = Number(body.result)
    return Number.isFinite(parsed) ? { kind: 'at', atMs: parsed } : { kind: 'unknown' }
  } catch {
    return { kind: 'unknown' }
  }
}
