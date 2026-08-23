import 'server-only'

import { sendOpsEmail } from '@/lib/ops/email'

import { readCronRun } from './heartbeat-store'
import {
  CRON_SCHEDULES,
  allHeartbeatVerdicts,
  type CronJob,
  type HeartbeatVerdict,
} from './heartbeat'

/**
 * Turn a stopped heartbeat into something a person actually receives.
 *
 * ## "Reaches a phone" — what is really provisioned, and what is not
 *
 * The brief asks for an alert that reaches a phone. The honest position:
 * **there is no SMS, WhatsApp or push rail in this project.** The environment
 * carries `RESEND_API_KEY` and `SENTRY_DSN` and nothing else that can reach a
 * person — no Twilio, no Gupshup, no phone number of any kind. Inventing an
 * integration against credentials that do not exist would produce an alerting
 * path that silently sends nothing, which is the exact failure this card exists
 * to remove.
 *
 * So this sends EMAIL, via the Resend rail the ops console already uses. On a
 * phone with mail push enabled that is a phone alert; it is not an SMS, and this
 * comment is the place that says so rather than a README nobody reads. Adding a
 * real SMS rail is a founder action — an account and a number — and it is listed
 * as one.
 *
 * ## Why it does not alert on every tick
 *
 * A stopped daily job would otherwise send 288 identical emails a day from the
 * five-minute sweep that noticed it. The suppression window is deliberately
 * crude — one message per job per window, held in the same Upstash the heartbeat
 * uses — because a missed re-alert is recoverable (the console still shows it,
 * and the next window sends again) and an inbox full of duplicates is not: it
 * gets a filter rule, and then the next real alert is never seen.
 */

/** One message per job per this long. */
const RE_ALERT_AFTER_MS = 6 * 60 * 60 * 1000

const SUPPRESS_PREFIX = 'sahoda:cron:alerted:'

function credentials(): { url: string; token: string } | null {
  const url = process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.UPSTASH_REDIS_REST_TOKEN
  if (!url || !token) return null
  return { url: url.replace(/\/$/, ''), token }
}

/**
 * Three outcomes, not two.
 *
 * `declined` means another tick already alerted inside the window — the rail is
 * working and is doing its job. `unavailable` means we could not ask. Collapsing
 * them into one boolean is what hid the defect below for as long as it existed:
 * a permanently broken claim looked exactly like healthy suppression.
 */
export type AlertSlot = 'claimed' | 'declined' | 'unavailable'

/**
 * Claim the right to send for this job, or decline.
 *
 * FAILS CLOSED — no Upstash means no claim means no send. The opposite choice
 * would turn an Upstash outage into an unthrottled mail loop, and a rail that
 * floods is a rail that gets muted.
 *
 * ── THE URL WAS WRONG, AND IT MADE THIS WHOLE FILE INERT ─────────────────────
 * This used to send `?NX=true&EX=n`. MEASURED against real Upstash 2026-08-22:
 *
 *   ?NX=true&EX=60  →  HTTP 400  {"error":"ERR syntax error"}
 *   ?NX&EX=60       →  HTTP 200  {"result":"OK"}   then {"result":null}
 *
 * `NX` is a FLAG in the Redis SET command, not a parameter with a value, and
 * Upstash passes the query string through to Redis verbatim. So `!response.ok`
 * was true on every call, every job was reported `suppressed`, and no alert had
 * ever been sent or ever could be. The unit tests could not see it: they mock
 * fetch, so they asserted our own idea of the URL back to us.
 *
 * Every branch here is now exercised against real Upstash by
 * `alert.live.test.ts`.
 */
export async function claimAlertSlot(job: CronJob, nowMs: number): Promise<AlertSlot> {
  const creds = credentials()
  if (creds === null) return 'unavailable'

  try {
    // NX = set only if absent, EX = expire. Together they are a lock with a
    // lease: the first caller in the window wins and the key evaporates in time
    // for the next one, with no reader-then-writer race between two ticks.
    const response = await fetch(
      `${creds.url}/set/${encodeURIComponent(SUPPRESS_PREFIX + job)}/${nowMs}?NX&EX=${Math.floor(
        RE_ALERT_AFTER_MS / 1000,
      )}`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${creds.token}` },
        cache: 'no-store',
      },
    )
    if (!response.ok) return 'unavailable'
    const body = (await response.json()) as { result?: unknown }
    // Upstash returns "OK" when NX succeeded and null when the key was there.
    return body.result === 'OK' ? 'claimed' : 'declined'
  } catch {
    return 'unavailable'
  }
}

export interface AlertReport {
  readonly checked: readonly HeartbeatVerdict[]
  readonly alarming: readonly HeartbeatVerdict[]
  readonly sent: readonly CronJob[]
  /** Another tick already alerted inside the window. The rail is working. */
  readonly suppressed: readonly CronJob[]
  /**
   * We could not ask whether to send, so we did not. Reported separately from
   * `suppressed` because a broken rail and a working one must not read alike —
   * a non-empty list here means NOBODY WAS TOLD and the reason was our own
   * plumbing, not restraint.
   */
  readonly undeliverable: readonly CronJob[]
}

/**
 * Read every job's trace, and mail about the ones that have stopped.
 *
 * Returns what it found AND what it did, so a caller can put honest counts in a
 * cron response body instead of a bare `ok: true` that proves nothing ran.
 *
 * Never throws. This runs inside cron routes whose real work must not be taken
 * down by their own watchdog.
 */
export async function checkAndAlertHeartbeats(nowMs: number = Date.now()): Promise<AlertReport> {
  // DERIVED from the schedule table, never listed here. This used to be a
  // hard-coded `['sweeps', 'metrics']` while `allHeartbeatVerdicts` below
  // iterated all THREE schedules — so `loop` was judged on a last-run this
  // function never read, and would have reported "nothing has been recorded"
  // for ever even on a night it ran perfectly. A guard whose input list is
  // shorter than its output list is answering about rows it never looked at.
  const jobs = Object.keys(CRON_SCHEDULES) as CronJob[]
  const lastRuns: Partial<Record<CronJob, number | null>> = {}
  for (const job of jobs) {
    lastRuns[job] = await readCronRun(job)
  }

  const checked = allHeartbeatVerdicts(lastRuns, nowMs)
  // `late` is not mailed about — see heartbeat.ts. Only a verdict that says the
  // job has stopped, or that nothing is known at all, is worth an interruption.
  const alarming = checked.filter((v) => v.alarming)

  const sent: CronJob[] = []
  const suppressed: CronJob[] = []
  const undeliverable: CronJob[] = []

  for (const verdict of alarming) {
    const slot = await claimAlertSlot(verdict.job, nowMs)
    if (slot === 'declined') {
      suppressed.push(verdict.job)
      continue
    }
    if (slot === 'unavailable') {
      undeliverable.push(verdict.job)
      continue
    }
    const outcome = await sendOpsEmail({
      subject: `Sahoda: ${verdict.job} has stopped running`,
      // The body states the measurement and the consequence, and names the one
      // thing a reader can do. No stack trace: the failure is that nothing
      // happened, so there is nothing to trace.
      text: [
        verdict.label,
        '',
        verdict.job === 'metrics'
          ? 'Every night this does not run is a day of post performance that the platforms will not tell us again.'
          : 'While this is stopped, scheduled posts are not going out.',
        '',
        'Check the cron entries in apps/web/vercel.json and the Vercel project cron log.',
      ].join('\n'),
    })
    if (outcome.ok) sent.push(verdict.job)
    // The slot was claimed but the mail did not go. Not silence: the claim key
    // now blocks a retry for six hours, so this is the one case where a reader
    // must see that the alarm was raised and nobody received it.
    else undeliverable.push(verdict.job)
  }

  return { checked, alarming, sent, suppressed, undeliverable }
}
