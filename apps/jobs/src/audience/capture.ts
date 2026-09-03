import {
  AUDIENCE_DIMENSIONS,
  POPULATION_METRIC,
  classifyAudience,
  type AudienceDimension,
  type AudiencePopulation,
  type AudienceState,
  type ZernioInstagramDemographics,
} from '@sahoda/publishing'
import type { Channel } from '@sahoda/shared'

/**
 * The daily pass that gives an audience a history.
 *
 * ── WHY THIS JOB EXISTS ──────────────────────────────────────────────────────
 * Instagram reports the demographic split of your followers RIGHT NOW. There is no
 * history endpoint, no timestamp on the answer, and no way to ask what last month
 * looked like. Every day this pass does not run is a day of audience history that
 * can never be collected — the same argument as the metric pass, one notch worse,
 * because the metric pass at least gets a `lastUpdated` stamp.
 *
 * ── THE ONE RULE IT WILL NOT BEND ────────────────────────────────────────────
 * IT NEVER WRITES A NUMBER IT WAS NOT GIVEN. A dimension the platform did not
 * report produces NO ROW, and a day with no rows is drawn as a GAP rather than a
 * zero. That matters more here than anywhere else in the product, because the table
 * is append-only: a fabricated zero cannot be taken out again, and every screen
 * downstream has every reason to trust a stored number.
 *
 * The distinction that makes it subtle, and the one a "reject zeroes" guard gets
 * backwards: Instagram DOES report genuine zeroes. `followers_gained` is 0 on a
 * quiet day and that is a measurement. So the rule is about the ABSENCE OF A KEY,
 * never about the value 0. `apps/jobs/src/audience/capture.test.ts` mutates this
 * file in both directions and watches each mutation go red.
 *
 * ── AND AN EMPTY ANSWER IS NOT A FAILURE ─────────────────────────────────────
 * Meta withholds demographics below 100 followers, and what arrives is HTTP 200
 * with every dimension an empty array — measured 2026-08-20. This pass records that
 * as `suppressed`, not as an error, and writes nothing for it. Nothing alerts.
 *
 * Pure: no database, no HTTP, no clock. `now` is injected and every dependency is a
 * function the caller supplies — the same shape the publish, reconcile and metric
 * passes use, so this can be executed in a test rather than read.
 */

/** The two populations, captured in one pass because they are one request each. */
export const CAPTURED_POPULATIONS = ['followers', 'engaged'] as const

/** What `audience_snapshots.dimension` accepts for the account total. */
export const FOLLOWER_COUNT_DIMENSION = 'follower_count'

/** The three buckets under `follower_count`. A STOCK and two FLOWS; never summed. */
export const FOLLOWER_BUCKETS = ['total', 'gained', 'lost'] as const
export type FollowerBucket = (typeof FOLLOWER_BUCKETS)[number]

/** Zernio's series keys for those three, as observed live 2026-08-20. */
export const FOLLOWER_SERIES: Readonly<Record<FollowerBucket, string>> = {
  total: 'follower_count',
  gained: 'followers_gained',
  lost: 'followers_lost',
}

/** One connected account that can be asked about. */
export interface AudienceTarget {
  workspaceId: string
  /** Zernio's SocialAccount id — 24 hex. The analytics key for every call here. */
  accountId: string
  channel: Channel
}

/** One number, ready to store. Built only from a figure the platform reported. */
export interface AudienceSnapshot {
  workspaceId: string
  accountId: string
  channel: Channel
  audience: AudiencePopulation
  dimension: AudienceDimension | typeof FOLLOWER_COUNT_DIMENSION
  bucket: string
  value: number
  /** The day this belongs to. The platform's own date where it gives one. */
  measuredOn: string
  /** What the platform said the figure covers. Its word, or 'day' for a dated point. */
  timeframe: string
  /** Which endpoint produced it. */
  source: string
}

/** Whether the history table is there yet. `not-ready` is not a failure. */
export type AudienceStorage = 'ready' | 'not-ready'

/** One dated point of a follower series. */
export interface FollowerPoint {
  date: string
  value: number
}

/** What the follower endpoint gave us, already narrowed. */
export interface FollowerHistory {
  total: FollowerPoint[]
  gained: FollowerPoint[]
  lost: FollowerPoint[]
}

export interface AudienceCaptureDeps {
  listTargets: () => Promise<AudienceTarget[]>
  /**
   * Demographics for one account and one population.
   *
   * Resolves with the payload or REJECTS. It must not swallow a failure into an
   * empty payload: that would turn an outage into "this account is too small",
   * which is the exact confusion this whole feature is shaped around.
   */
  readDemographics: (
    accountId: string,
    population: AudiencePopulation,
  ) => Promise<ZernioInstagramDemographics>
  /** The dated follower series, or null when the call failed. */
  readFollowerHistory: (accountId: string) => Promise<FollowerHistory | null>
  writeSnapshots: (rows: readonly AudienceSnapshot[]) => Promise<{
    inserted: number
    storage: AudienceStorage
  }>
  now?: Date
}

export interface AudienceCaptureReport {
  targets: number
  /** Accounts that came back with at least one demographic bucket. */
  measured: number
  /** Accounts under Meta's follower floor. Healthy — not an error, not a retry. */
  suppressed: number
  /** The platform reported nothing and the follower count does not explain it. */
  noData: number
  /** The platform answered and could not resolve the account. Permanent. */
  unresolved: number
  /** The call failed. OURS to fix. */
  unreadable: number
  /** This deployment holds no key, or the plan does not include analytics. */
  notConfigured: number
  /** Accounts whose follower count could be read at all. */
  followerSeries: number
  collected: number
  written: number
  /**
   * The newest day this pass collected anything for, and how many distinct days
   * the batch covered.
   *
   * `written: 0` is the correct, healthy answer for a pass that runs twice in a
   * day — and it is ALSO what a stall looks like. Since the whole case for this
   * table is that a missed day cannot be collected later, the run output carries
   * the newest day so that whoever looks CAN tell the two apart. Nothing alerts.
   */
  newestDay: string | null
  daysInBatch: number
  storage: AudienceStorage
}

/** A date the platform actually dated, as `YYYY-MM-DD`. Anything else is not a day. */
const DAY = /^\d{4}-\d{2}-\d{2}$/

function dayOf(value: string): string | null {
  const day = value.slice(0, 10)
  return DAY.test(day) ? day : null
}

/** Today, in UTC. Used ONLY where the platform dated nothing itself. */
export function utcDay(now: Date): string {
  return now.toISOString().slice(0, 10)
}

/**
 * Turn one demographics payload into rows.
 *
 * `breakdownFrom` has already dropped every bucket that could not be narrowed and
 * every dimension that came back empty, so anything reaching here was reported.
 *
 * The day comes from `now`, because this endpoint dates nothing — the migration
 * says so in section 1 and this is the code that relies on it.
 */
export function demographicRows(
  target: AudienceTarget,
  population: AudiencePopulation,
  state: Extract<AudienceState, { kind: 'ready' }>,
  now: Date,
): AudienceSnapshot[] {
  const rows: AudienceSnapshot[] = []
  const measuredOn = utcDay(now)
  for (const dimension of AUDIENCE_DIMENSIONS) {
    const buckets = state.breakdown[dimension]
    // A dimension the platform did not report writes NOTHING. Not a zero, not a
    // carried-forward value from yesterday — the gap is the honest record.
    if (buckets === undefined) continue
    for (const bucket of buckets) {
      rows.push({
        workspaceId: target.workspaceId,
        accountId: target.accountId,
        channel: target.channel,
        audience: population,
        dimension,
        bucket: bucket.label,
        value: bucket.value,
        measuredOn,
        timeframe: state.timeframe ?? 'unknown',
        source: `zernio:instagram_demographics:${POPULATION_METRIC[population]}`,
      })
    }
  }
  return rows
}

/**
 * Turn the follower series into rows — one per dated point, per bucket.
 *
 * The day here is the PLATFORM'S OWN DATE, never today. One call returns roughly
 * thirty dated points, and stamping them all with today would collapse a month of
 * history into a single row and lose the other twenty-nine for good.
 *
 * A point whose date is not a date is dropped rather than dated with a fallback.
 */
export function followerRows(
  target: AudienceTarget,
  history: FollowerHistory,
  audience: AudiencePopulation = 'followers',
): AudienceSnapshot[] {
  const rows: AudienceSnapshot[] = []
  for (const bucket of FOLLOWER_BUCKETS) {
    for (const point of history[bucket]) {
      const measuredOn = dayOf(point.date)
      if (measuredOn === null) continue
      rows.push({
        workspaceId: target.workspaceId,
        accountId: target.accountId,
        channel: target.channel,
        audience,
        dimension: FOLLOWER_COUNT_DIMENSION,
        bucket,
        value: point.value,
        measuredOn,
        // 'day', not 'this_month': these points really are per-day, and calling
        // them anything else would let a reader treat a daily gain as a monthly one.
        timeframe: 'day',
        source: 'zernio:instagram_follower_history',
      })
    }
  }
  return rows
}

/**
 * The current follower count, for the suppression judgement.
 *
 * The LAST DATED POINT, not the endpoint's `total` field. Under
 * `metricType=time_series` Zernio reports both, and for a series whose points are
 * all 1 they are indistinguishable — so `total` cannot be shown to be a current
 * count rather than a sum. The last dated point is unambiguous, and it is the same
 * number the screen will later read back out of our own table.
 */
export function currentFollowers(history: FollowerHistory | null): number | null {
  if (history === null) return null
  const dated = history.total.filter((p) => dayOf(p.date) !== null)
  if (dated.length === 0) return null
  const newest = dated.reduce((a, b) => (a.date > b.date ? a : b))
  return newest.value
}

export async function runAudienceCapture(
  deps: AudienceCaptureDeps,
): Promise<AudienceCaptureReport> {
  const now = deps.now ?? new Date()
  const targets = await deps.listTargets()

  let measured = 0
  let suppressed = 0
  let noData = 0
  let unresolved = 0
  let unreadable = 0
  let notConfigured = 0
  let followerSeries = 0
  const rows: AudienceSnapshot[] = []

  for (const target of targets) {
    // ── THE FOLLOWER COUNT COMES FIRST, AND THE ORDER IS THE POINT ───────────
    // Suppression cannot be claimed without it. Reading demographics first and
    // then reaching for a count would leave a whole branch where an empty answer
    // has to be classified with nothing to classify it by.
    let history: FollowerHistory | null = null
    try {
      history = await deps.readFollowerHistory(target.accountId)
    } catch {
      history = null
    }
    if (history !== null) {
      followerSeries += 1
      rows.push(...followerRows(target, history))
    }
    const followers = currentFollowers(history)

    let anyMeasured = false
    let sawSuppressed = false
    for (const population of CAPTURED_POPULATIONS) {
      let state: AudienceState
      try {
        const payload = await deps.readDemographics(target.accountId, population)
        state = classifyAudience({ result: { ok: true, payload }, followers })
      } catch (error) {
        // A thrown call is "we could not read it", never "there is nothing".
        state = classifyAudience({ result: { ok: false, error }, followers })
      }

      if (state.kind === 'ready') {
        const built = demographicRows(target, population, state, now)
        if (built.length > 0) {
          anyMeasured = true
          rows.push(...built)
        }
        continue
      }
      if (state.kind === 'suppressed') sawSuppressed = true
      else if (state.kind === 'no-data') noData += 1
      else if (state.kind === 'unresolved') unresolved += 1
      else if (state.kind === 'not-configured') notConfigured += 1
      else unreadable += 1
    }

    if (anyMeasured) measured += 1
    // Counted once per ACCOUNT, not once per population: both populations sit
    // behind the same follower floor, so an account under it produces two
    // `suppressed` verdicts describing one fact. Counting both would report twice
    // as many small accounts as exist.
    else if (sawSuppressed) suppressed += 1
  }

  // One write for the whole pass. Called even with nothing to store, because the
  // report has to be able to say whether the table is there — and "no rows" and
  // "no table" are different answers to different questions.
  const { inserted, storage } = await deps.writeSnapshots(rows)

  const days = new Set(rows.map((row) => row.measuredOn))

  return {
    targets: targets.length,
    measured,
    suppressed,
    noData,
    unresolved,
    unreadable,
    notConfigured,
    followerSeries,
    collected: rows.length,
    written: inserted,
    // Derived from what was COLLECTED, not from what was stored: a pass that
    // collected a fresh day and stored nothing is the ordinary same-day repeat; a
    // pass whose newest day has not moved in a week is the stall. Both say
    // `written: 0`.
    newestDay: days.size === 0 ? null : [...days].reduce((a, b) => (a > b ? a : b)),
    daysInBatch: days.size,
    storage,
  }
}
