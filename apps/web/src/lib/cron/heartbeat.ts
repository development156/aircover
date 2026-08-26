/**
 * Is a scheduled job still running at all?
 *
 * ## The failure mode this exists for
 *
 * Every alarm in this codebase so far fires on an ERROR — a throw, a 500, a
 * failed row. A cron that stops being *called* produces none of those. It
 * produces nothing, and nothing is indistinguishable from a quiet night.
 *
 * That is not hypothetical here. `/api/cron/metrics` has never run once in
 * production, and the way anyone found out was by asking the live site whether
 * the route existed. It had been silent for as long as it had existed, and the
 * silence read exactly like success. Meanwhile the sibling cron next to it
 * ticked 288 times a day. Nothing anywhere said one of the two was missing.
 *
 * So the thing being watched is ABSENCE, and the rule that follows is the one
 * `lib/ops/freshness.ts` already argues for at length: a job that never runs
 * cannot report that it never ran. Any "I am healthy" field the job writes about
 * itself is worthless, because the failure being detected is the job not
 * executing the line that would write it.
 *
 * What a job CAN leave is a trace — a timestamp stamped as it runs. Its absence
 * is then the signal, and absence cannot be forged by a process that is not
 * running.
 *
 * ## `unknown` is not `healthy`, and that is the whole discipline
 *
 * A missing trace means either "the job has not run" or "we could not read the
 * store". Those are different, and neither is "fine". Both return `unknown`, and
 * `unknown` is rendered and alerted on, never silently treated as beating. The
 * same corollary freshness.ts draws: "we have no idea how old this is" and "this
 * is current" are opposite claims.
 *
 * ## What this cannot catch, stated rather than papered over
 *
 * If Vercel's scheduler stops entirely, no cron runs — including whichever cron
 * is checking the others. A watchdog that lives inside the thing it watches
 * cannot survive the thing it watches dying. Two consequences, both deliberate:
 *
 *  - the crons cross-check each other, so one stopping is caught by the other;
 *  - the verdict is ALSO computed on `/admin/dev`, on a human's page load, which
 *    is the only path that still works when nothing is scheduled at all.
 *
 * A genuinely external checker would close the last gap. Nothing external is
 * provisioned, so this says so instead of implying coverage it does not have.
 *
 * Pure module: `now` and the last-run timestamp are both parameters. No clock,
 * no I/O, no env.
 */

/**
 * The jobs declared in `apps/web/vercel.json`.
 *
 * The pinning lives in `heartbeat.test.ts`, under "the schedules match the crons
 * that actually ship" — it asserts the two lists name the same routes AND that
 * each period matches the cron expression, with a parser that throws rather than
 * guessing at a shape it does not recognise.
 *
 * This comment used to name a file called `heartbeat-schedule.test.ts`, which
 * does not exist. Corrected 2026-08-22 while adding the fourth job. The guard was
 * real all along; only the pointer was wrong — which is its own small hazard,
 * because the way to check a claim like this is to go and read the file it names,
 * and doing that here produces "no such file" rather than "no such guard".
 */
export type CronJob = 'sweeps' | 'metrics' | 'loop' | 'playbooks' | 'radar' | 'brain'

export interface CronSchedule {
  /** How often the job is scheduled, in ms. From the cron expression, not a guess. */
  readonly periodMs: number
  /**
   * How many consecutive missed runs before the job is called stopped.
   *
   * Two, not one. Vercel documents that cron delivery can be both duplicated and
   * MISSED — the sweeps route's own header says so — so a single skipped tick is
   * within the platform's stated behaviour and alarming on it would page someone
   * for a documented non-event. Two consecutive misses is no longer a delivery
   * hiccup.
   */
  readonly missesBeforeStopped: number
  /** For the sentence a human reads. */
  readonly label: string
}

const MINUTE = 60_000
const HOUR = 60 * MINUTE

export const CRON_SCHEDULES: Record<CronJob, CronSchedule> = {
  // `*/5 * * * *`
  sweeps: { periodMs: 5 * MINUTE, missesBeforeStopped: 2, label: 'Publishing sweep' },
  // `20 1 * * *` — once a day
  metrics: { periodMs: 24 * HOUR, missesBeforeStopped: 2, label: 'Nightly metric capture' },
  // `0 21 * * 0` — Sunday evening, once a week (FSD M2: "Sunday 21:00").
  //
  // `missesBeforeStopped: 2` would mean a fortnight of silence before anybody was
  // told, which is long enough for a customer to notice before the monitoring
  // does. One miss it is: a weekly job has no delivery-hiccup tolerance to spend,
  // because the hiccup and the outage look identical for seven days.
  loop: { periodMs: 7 * 24 * HOUR, missesBeforeStopped: 1, label: 'Weekly Loop cycle' },
  // `0 6 * * *` — early morning, once a day.
  //
  // Daily rather than weekly because a playbook's window is measured in days: a
  // seven-day lead time checked once a week would miss a festival entirely
  // whenever the check landed on the wrong side of it.
  playbooks: { periodMs: 24 * HOUR, missesBeforeStopped: 2, label: 'Daily Playbook check' },
  // `40 3 * * 1` — Monday morning, once a week.
  //
  // `missesBeforeStopped: 1`, for the reason `loop` gives above: two would mean a
  // FORTNIGHT of silence before anybody was told, and a weekly job has no
  // delivery-hiccup tolerance to spend because the hiccup and the outage look
  // identical for seven days. It matters more here than anywhere else on this
  // list — a missed Radar week cannot be collected later, since the pages have
  // already changed, and a silently dead scan is indistinguishable on screen from
  // competitors who happened to do nothing.
  radar: { periodMs: 7 * 24 * HOUR, missesBeforeStopped: 1, label: 'Weekly Radar scan' },
  // `30 21 * * 0` — Sunday evening, half an hour after the Loop.
  //
  // Same one-miss tolerance as the Loop, for the same reason: a weekly job has
  // no delivery-hiccup tolerance to spend, because for seven days a hiccup and
  // an outage look identical.
  brain: { periodMs: 7 * 24 * HOUR, missesBeforeStopped: 1, label: 'Weekly Marketing Brain pass' },
}

export type HeartbeatState = 'beating' | 'late' | 'stopped' | 'unknown'

export interface HeartbeatVerdict {
  readonly job: CronJob
  readonly state: HeartbeatState
  /** Milliseconds since the last recorded run, or null when nothing is known. */
  readonly ageMs: number | null
  /** A whole sentence, ready to render or to put in an email subject. */
  readonly label: string
  /** True when this verdict warrants telling somebody. */
  readonly alarming: boolean
}

function agoLabel(ms: number): string {
  const minutes = Math.floor(ms / MINUTE)
  if (minutes < 1) return 'less than a minute ago'
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 48) return `${hours} hour${hours === 1 ? '' : 's'} ago`
  const days = Math.floor(hours / 24)
  return `${days} days ago`
}

/** "every 5 minutes" · "once a day". The cadence, in the reader's words. */
function everyLabel(periodMs: number): string {
  if (periodMs >= 24 * HOUR) return 'once a day'
  if (periodMs >= HOUR) {
    const hours = Math.round(periodMs / HOUR)
    return `every ${hours} hour${hours === 1 ? '' : 's'}`
  }
  const minutes = Math.max(1, Math.round(periodMs / MINUTE))
  return `every ${minutes} minute${minutes === 1 ? '' : 's'}`
}

/**
 * Read the trace and say what it means.
 *
 * `lastRunMs` is whatever the store returned: a timestamp, or null for both "no
 * trace" and "could not read". The two are deliberately not distinguished here —
 * the caller knows which happened and neither is healthy, so collapsing them
 * keeps this function from having an opinion it cannot support.
 *
 * A timestamp in the FUTURE is treated as unknown rather than as the freshest
 * possible beat. Clock skew between a serverless region and this process is real,
 * and "the job ran in ten minutes' time" is not evidence of anything; reading it
 * as healthy would make a broken clock look like the best possible outcome.
 */
export function heartbeatVerdict(
  job: CronJob,
  lastRunMs: number | null,
  nowMs: number,
): HeartbeatVerdict {
  const schedule = CRON_SCHEDULES[job]

  if (lastRunMs === null || !Number.isFinite(lastRunMs) || !Number.isFinite(nowMs)) {
    return {
      job,
      state: 'unknown',
      ageMs: null,
      label: `${schedule.label}: nothing has been recorded, so we cannot say whether it is running.`,
      alarming: true,
    }
  }

  const ageMs = nowMs - lastRunMs
  if (ageMs < 0) {
    return {
      job,
      state: 'unknown',
      ageMs: null,
      label: `${schedule.label}: the last run is stamped in the future, so the record cannot be trusted.`,
      alarming: true,
    }
  }

  const stoppedAfter = schedule.periodMs * schedule.missesBeforeStopped
  if (ageMs > stoppedAfter) {
    return {
      job,
      state: 'stopped',
      ageMs,
      label: `${schedule.label} last ran ${agoLabel(ageMs)} and should run ${everyLabel(schedule.periodMs)}. It has stopped.`,
      alarming: true,
    }
  }

  if (ageMs > schedule.periodMs) {
    return {
      job,
      state: 'late',
      ageMs,
      label: `${schedule.label} last ran ${agoLabel(ageMs)}, which is later than expected.`,
      alarming: false,
    }
  }

  return {
    job,
    state: 'beating',
    ageMs,
    label: `${schedule.label} last ran ${agoLabel(ageMs)}.`,
    alarming: false,
  }
}

/** Every job's verdict, so a caller never has to remember the list. */
export function allHeartbeatVerdicts(
  lastRuns: Readonly<Partial<Record<CronJob, number | null>>>,
  nowMs: number,
): HeartbeatVerdict[] {
  return (Object.keys(CRON_SCHEDULES) as CronJob[]).map((job) =>
    heartbeatVerdict(job, lastRuns[job] ?? null, nowMs),
  )
}
