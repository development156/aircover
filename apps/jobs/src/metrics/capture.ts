import {
  classifyPostMetrics,
  reportingWindowFor,
  type PostMetrics,
  type ZernioPostAnalyticsResult,
} from '@sahoda/publishing'
import type { Channel } from '@sahoda/shared'

/**
 * The daily pass that gives one metric a history.
 *
 * ── WHY THIS JOB EXISTS ──────────────────────────────────────────────────────
 * Sahoda reads a post's numbers from the platform every time a screen is opened,
 * shows them, and stores none of them. So there is no trend to draw, and — the
 * part that is not recoverable — whatever a post's reach was last Tuesday is gone
 * for good. Platforms report the CURRENT number and nothing else; no amount of
 * asking later gets last week back. Every day without this pass is a day of
 * history that can never be collected.
 *
 * ── THE ONE RULE IT WILL NOT BEND ────────────────────────────────────────────
 * IT NEVER WRITES A NUMBER IT WAS NOT GIVEN. A metric that has not been measured
 * produces no row, and a day with no rows is drawn as a GAP rather than a zero.
 * That matters more here than anywhere else in the product, because a stored zero
 * is permanent: `analytics-state.ts` already refuses to render an unmeasured zero
 * on screen, and a job that wrote one would defeat that refusal for good, by
 * putting a fabricated number somewhere the screen has every reason to trust.
 *
 * Zernio answers with zeroes in at least three situations where nothing was
 * measured — a 202, a post still inside its platform's reporting window, and an
 * account it cannot resolve — so the classifier decides, and only `ready` counts.
 *
 * ── AND WHAT THE STORED NUMBER MEANS ─────────────────────────────────────────
 * A RUNNING TOTAL since the post went out, because that is what the platforms
 * report. Subtracting one day from the next to get "reach on Tuesday" would
 * produce a number no platform ever said, so nothing does it.
 *
 * Pure: no database, no HTTP, no clock. `now` is injected, and every dependency
 * is a function the caller supplies — the same shape the publish and reconcile
 * passes use, so this can be executed in a test rather than read.
 */

/** The three numbers worth keeping. Derived rates are not: they carry no evidence. */
export const CAPTURED_METRICS = ['impressions', 'reach', 'engagement'] as const
export type CapturedMetric = (typeof CAPTURED_METRICS)[number]

/** One published channel of one post that can actually be asked about. */
export interface MetricTarget {
  workspaceId: string
  /** Zernio profile for the workspace. Required: an unscoped read crosses tenants. */
  profileId: string
  postId: string
  channel: Channel
  /** The PLATFORM's id — the analytics key. Never Zernio's own 24-hex id. */
  platformPostId: string
  /** When it went out, for the reporting-window judgement. */
  publishedAt: string | null
}

/** One number, ready to store. Built only from a measurement that really happened. */
export interface MetricSnapshot {
  workspaceId: string
  postId: string
  channel: Channel
  metric: CapturedMetric
  value: number
  /** When the PLATFORM says it measured. Not when we asked. */
  measuredAt: string
}

/**
 * Whether the history table is there yet.
 *
 * `not-ready` is not a failure. Migration 20260819000100 applies to production and
 * is the founder's to run; until it does, this pass has nowhere to put anything and
 * says so plainly rather than raising an alarm every night.
 */
export type SnapshotStorage = 'ready' | 'not-ready'

export interface MetricCaptureDeps {
  listTargets: () => Promise<MetricTarget[]>
  readPostAnalytics: (
    profileId: string,
    platformPostId: string,
  ) => Promise<ZernioPostAnalyticsResult>
  /**
   * Store these, skipping any day already recorded. Returns how many rows were
   * NEW, and whether the table exists at all.
   *
   * "Skipping" rather than "replacing" is forced by the schema: the table blocks
   * updates outright, for everyone including this job, because a history anyone can
   * edit is a history nobody can trust. A second run on the same day is therefore a
   * no-op, which is what makes this pass safe to retry.
   */
  writeSnapshots: (rows: readonly MetricSnapshot[]) => Promise<{
    inserted: number
    storage: SnapshotStorage
  }>
  now?: Date
}

export interface MetricCaptureReport {
  /** Channels that could be asked about at all. */
  targets: number
  /** Of those, how many returned a real measurement. */
  measured: number
  /** Not measured YET — inside a reporting window, or still processing. */
  pending: number
  /**
   * The call itself failed — a network error, a refused request. OURS to fix.
   */
  unreadable: number
  /**
   * The platform answered and said it cannot tie this post to a live account.
   *
   * ── WHY THIS IS COUNTED APART FROM `unreadable` ─────────────────────────────
   * They were one number until 2026-08-19, and the first production run showed why
   * that was not good enough: one of seven targets came back uncountable on both
   * runs, with a `platform_post_id` the same shape as its five working siblings.
   * Merged, there was no way to tell whether Sahoda could not reach Zernio or
   * Zernio could not find the post — an outage on our side and a permanent state
   * on theirs, which need opposite responses. A retry fixes one and will never fix
   * the other.
   */
  unresolved: number
  /** Numbers built from those measurements. Several per measured channel. */
  collected: number
  /**
   * Rows actually stored. Lower than `collected` on a repeat run, and zero on a
   * second run of the same day — which is success, not a fault.
   */
  written: number
  /**
   * The newest measurement stamp seen this pass, and how many distinct days the
   * batch covered.
   *
   * ── WHY `written: 0` NEEDED A SECOND NUMBER BESIDE IT ────────────────────────
   * Zero written is the correct, healthy answer for a pass that runs twice in a
   * day. It is ALSO what a stall looks like: the day a row lands under is derived
   * from Zernio's own `lastUpdated`, and `analytics-state.ts` is explicit that this
   * stamp is safe to print and unsafe to reason about per post. If it stops
   * advancing, every night afterwards collects numbers, writes nothing, and reports
   * a clean run — while the history quietly stops growing.
   *
   * That is the worst failure available here, because the entire case for this
   * table is that a missed day cannot be collected later. So the run output carries
   * the stamp: `written: 0` at 01:20 on a day already done reads completely
   * differently from `written: 0` with a newest stamp six days old.
   *
   * Nothing alerts on this. It exists so that whoever looks CAN tell.
   */
  newestMeasuredAt: string | null
  daysInBatch: number
  storage: SnapshotStorage
}

/** Reads one metric defensively. Anything not a finite number is a gap, not a zero. */
function usable(value: PostMetrics[CapturedMetric]): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function snapshotsFor(target: MetricTarget, metrics: PostMetrics): MetricSnapshot[] {
  const rows: MetricSnapshot[] = []
  for (const metric of CAPTURED_METRICS) {
    const value = metrics[metric]
    // A metric the platform did not report writes NOTHING. Not a zero, not a
    // carried-forward value from yesterday — the gap is the honest record.
    if (!usable(value)) continue
    rows.push({
      workspaceId: target.workspaceId,
      postId: target.postId,
      channel: target.channel,
      metric,
      value,
      measuredAt: metrics.measuredAt,
    })
  }
  return rows
}

export async function runMetricCapture(deps: MetricCaptureDeps): Promise<MetricCaptureReport> {
  const now = deps.now ?? new Date()
  const targets = await deps.listTargets()

  let measured = 0
  let pending = 0
  let unreadable = 0
  let unresolved = 0
  const rows: MetricSnapshot[] = []

  for (const target of targets) {
    let answer: ZernioPostAnalyticsResult
    try {
      answer = await deps.readPostAnalytics(target.profileId, target.platformPostId)
    } catch {
      // A thrown call is "we could not read it", never "there is nothing". The
      // difference is the whole point of counting these separately.
      unreadable += 1
      continue
    }

    const state = classifyPostMetrics({
      result: answer,
      platformPostId: target.platformPostId,
      published: true,
      // A fixture never touched a platform, so it is never a target — the store's
      // query excludes it. Passed honestly rather than left to be inferred.
      simulated: false,
      publishedAt: target.publishedAt,
      now,
      // Each channel against its OWN window. Three of the four honestly carry
      // "unknown", and an unknown window is what stops a payload of zeroes being
      // recorded as a measurement of nothing.
      window: reportingWindowFor(target.channel),
    })

    if (state.kind === 'ready') {
      const built = snapshotsFor(target, state.metrics)
      // A "ready" verdict whose every field was absent measured nothing. Counting
      // it as measured would make the coverage figure on the chart a fiction.
      if (built.length > 0) {
        measured += 1
        rows.push(...built)
      } else {
        pending += 1
      }
      continue
    }

    if (state.kind === 'pending') pending += 1
    // `unresolved` is the platform's own verdict — it answered, and said it cannot
    // resolve this post to an account. `unavailable` covers the cases where no
    // useful call could be made at all, which is the same kind of gap as a failure.
    else if (state.kind === 'unresolved') unresolved += 1
    else unreadable += 1
  }

  // One write for the whole pass. Called even with nothing to store, because the
  // report has to be able to say whether the table is there — and "no rows" and
  // "no table" are different answers to different questions.
  const { inserted, storage } = await deps.writeSnapshots(rows)

  // Derived from what was MEASURED, not from what was stored: a pass that collected
  // a fresh stamp and stored nothing is the ordinary same-day repeat, and a pass
  // whose newest stamp has not moved in days is the stall. Both report `written: 0`.
  const stamps = rows.map((row) => row.measuredAt).filter((at) => at !== '')
  const days = new Set(stamps.map((at) => at.slice(0, 10)))

  return {
    targets: targets.length,
    measured,
    pending,
    unreadable,
    collected: rows.length,
    written: inserted,
    unresolved,
    newestMeasuredAt: stamps.length === 0 ? null : stamps.reduce((a, b) => (a > b ? a : b)),
    daysInBatch: days.size,
    storage,
  }
}
