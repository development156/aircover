import type { ZernioPostAnalytics, ZernioPostAnalyticsResult } from './reads'

/**
 * What a metric is ALLOWED to claim, decided before anything renders.
 *
 * ── WHY THIS FILE EXISTS ─────────────────────────────────────────────────────
 * `ZernioPostMetrics` types every metric as a required `number`. That makes zero
 * indistinguishable from absent at the type level, and Zernio produces zeroes in at
 * least three situations where nothing was measured:
 *
 *   1. HTTP 202 — accepted but not computed. `parse()` passes any status under 400
 *      through as success, so the body arrives well-formed with every metric 0.
 *      `PublishSuccess.platformPostId` records this as permanent for a wrong id.
 *   2. Instagram's reporting lag — insights land ~48h behind, follower history ~24h.
 *      A post published this morning has no data, and Zernio says so with zeroes.
 *   3. `syncStatus: 'orphaned'` — Zernio cannot tie the post back to a live account,
 *      so the metric is not late, it is unresolvable.
 *
 * A number that arrives for any of those reasons is not a measurement, and rendering
 * it as one tells the customer their post reached nobody. This module is the single
 * place that decision is made; the UI renders the verdict and never re-derives it.
 *
 * Pure: no I/O, no clock, no React. `now` is injected.
 */

/** Instagram insights land roughly two days behind. Fallback when no `dataDelay` is given. */
export const INSTAGRAM_INSIGHTS_LAG_HOURS = 48
/** Follower history lands roughly one day behind. Fallback when no `dataDelay` is given. */
export const INSTAGRAM_FOLLOWER_LAG_HOURS = 24

const HOUR_MS = 60 * 60 * 1000

/**
 * One metric, or an honest gap.
 *
 * `null` means Zernio did not report the field. It is NOT zero. The wire body is cast
 * to `ZernioPostMetrics` rather than validated, so a field the type calls a required
 * `number` can be absent at runtime — and `undefined` rendered into a number slot is
 * how a gap becomes a "0".
 */
export type MetricNumber = number | null

/** The three headline numbers, plus the proof of when they were measured. */
export interface PostMetrics {
  impressions: MetricNumber
  reach: MetricNumber
  /** Interactions summed from the components Zernio reported. Null if it reported none. */
  engagement: MetricNumber
  /** Zernio's own rate when present — never recomputed from a reach we may not have. */
  engagementRate: MetricNumber
  /** The measurement's timestamp. Its presence is what makes the numbers real. */
  measuredAt: string
}

/**
 * Why a metric cannot be shown yet, or at all.
 *
 * `pending` will resolve on its own; `unresolved` and `unavailable` will not. The
 * split matters because the copy differs: "check back" versus "this cannot be tied
 * to an account" versus "connect Instagram".
 */
export type MetricAvailability =
  | { kind: 'ready'; metrics: PostMetrics }
  | {
      kind: 'pending'
      /**
       * `processing` — Zernio answered 202; it has the post, not the numbers.
       * `lag`        — published inside the platform's reporting window.
       * `never-measured` — past the window with still no measurement.
       */
      reason: 'processing' | 'lag' | 'never-measured'
      /** When the window closes, for `lag` only. ISO-8601. */
      availableAfter: string | null
    }
  | { kind: 'unresolved'; message: string | null }
  | {
      kind: 'unavailable'
      /**
       * `not-published`  — nothing has gone out on this channel.
       * `simulated`      — the publish ran in fixture mode. Nothing reached the
       *                    platform, so there are no metrics and never will be. Kept
       *                    apart from `no-platform-id` because that one blames the
       *                    platform, and in this case the platform was never asked.
       * `no-platform-id` — published, but the platform never issued an id, so there
       *                    is no analytics key to ask with. No request is made.
       * `not-connected`  — no Zernio account for this channel in this workspace.
       * `reconnect`      — the connection exists but is not active.
       * `unreadable`     — the call failed. Distinct from "no data".
       * `not-loaded`     — deliberately not fetched, because a list caps how many
       *                    calls one render may make. Kept apart from `unreadable`
       *                    because nothing went wrong and "try again" is bad advice:
       *                    the fix is to open the post, not to refresh the list.
       */
      reason:
        | 'not-published'
        | 'simulated'
        | 'no-platform-id'
        | 'not-connected'
        | 'reconnect'
        | 'unreadable'
        | 'not-loaded'
    }

/** Reads one numeric field defensively. Anything not a finite number is a gap, not a 0. */
function num(raw: unknown): MetricNumber {
  return typeof raw === 'number' && Number.isFinite(raw) ? raw : null
}

/**
 * Sum the interaction components Zernio actually reported.
 *
 * Returns null when it reported NONE of them — an engagement of 0 built from four
 * missing fields is the exact fabrication this module exists to prevent. A single
 * reported component is enough to make the sum a real (if partial) measurement.
 */
function engagementOf(metrics: Record<string, unknown>): MetricNumber {
  const parts = [metrics.likes, metrics.comments, metrics.shares, metrics.saves].map(num)
  const present = parts.filter((p): p is number => p !== null)
  return present.length === 0 ? null : present.reduce((a, b) => a + b, 0)
}

/** Zernio's `syncStatus` for the leg this analytics key belongs to, if it named one. */
function legSyncStatus(post: ZernioPostAnalytics, platformPostId: string): string | undefined {
  const leg = post.platformAnalytics?.find((p) => p.platformPostId === platformPostId)
  return leg?.syncStatus ?? post.syncStatus
}

/** The leg's own error text, so "unresolved" can say what Zernio said. */
function legMessage(post: ZernioPostAnalytics, platformPostId: string): string | null {
  const leg = post.platformAnalytics?.find((p) => p.platformPostId === platformPostId)
  return leg?.errorMessage ?? post.message ?? null
}

export interface ClassifyInput {
  /** The analytics answer WITH its status. Null when no call was made or it failed. */
  result: ZernioPostAnalyticsResult | null
  /** This channel's `post_variants.platform_post_id`. Null means no key, so no call. */
  platformPostId: string | null
  /** This channel's publish status. Only `published` can have metrics. */
  published: boolean
  /**
   * The publish ran in fixture mode — nothing reached the platform.
   *
   * Derived from the `fixture://` permalink rather than from a null id: the id is
   * erased on the way out of the database, so by the time it reaches here "no id" and
   * "simulated" look identical, and only the permalink still carries the difference.
   */
  simulated?: boolean
  /** When this channel went out, ISO-8601. Null when unknown. */
  publishedAt: string | null
  now: Date
  /** Hours the platform lags. Defaults to Instagram insights. */
  lagHours?: number
}

/**
 * The one decision: what may this channel's metrics claim?
 *
 * ── PRECEDENCE, AND WHY THIS ORDER ───────────────────────────────────────────
 * Each rule fires only when every rule above it did not, and the order is not
 * arbitrary — it runs from "we never asked" down to "we asked and got an answer":
 *
 *   1. not published      — nothing exists to measure.
 *   1a. simulated         — a fixture run. Nothing reached the platform, so there is
 *                           nothing to measure and no platform to blame for it.
 *   2. no platform id     — nothing to ask WITH. No request is issued at all.
 *   3. no result          — we asked and could not read the answer.
 *   4. orphaned           — BEFORE 202 on purpose. A post that is both orphaned and
 *                           still processing is not "check back later"; it will never
 *                           resolve, and "processing" would promise that it will.
 *   5. 202                — accepted, not computed. The zeroes in the body are not data.
 *   6. no measuredAt      — `lastUpdated` is the only proof a measurement happened, so
 *                           its absence is decisive regardless of what the numbers say.
 *   7. ready              — and only here can a number reach the screen.
 *
 * Rule 6 is what makes `ready` safe by construction: it cannot be reached with an
 * absent `analytics` object or a null `lastUpdated`.
 */
export function classifyPostMetrics(input: ClassifyInput): MetricAvailability {
  const { result, platformPostId, published, publishedAt, now, simulated } = input

  if (!published) return { kind: 'unavailable', reason: 'not-published' }
  // Before the id check, deliberately: a fixture publish has no real id either, and
  // falling through to `no-platform-id` would blame a platform that was never asked.
  if (simulated) return { kind: 'unavailable', reason: 'simulated' }
  if (!platformPostId) return { kind: 'unavailable', reason: 'no-platform-id' }
  if (!result) return { kind: 'unavailable', reason: 'unreadable' }

  const { post, status } = result

  if (legSyncStatus(post, platformPostId) === 'orphaned') {
    return { kind: 'unresolved', message: legMessage(post, platformPostId) }
  }

  if (status === 202) return { kind: 'pending', reason: 'processing', availableAfter: null }

  const analytics = post.analytics
  const measuredAt = analytics?.lastUpdated

  if (!analytics || typeof measuredAt !== 'string' || measuredAt === '') {
    return pendingForLag(publishedAt, now, input.lagHours ?? INSTAGRAM_INSIGHTS_LAG_HOURS)
  }

  const raw = analytics as unknown as Record<string, unknown>
  return {
    kind: 'ready',
    metrics: {
      impressions: num(raw.impressions),
      reach: num(raw.reach),
      engagement: engagementOf(raw),
      engagementRate: num(raw.engagementRate),
      measuredAt,
    },
  }
}

/**
 * No measurement yet — is it too early, or simply never coming?
 *
 * Unknown `publishedAt` falls to `never-measured` rather than `lag`: `lag` promises a
 * time, and a promise built on a timestamp we do not have is a guess.
 */
function pendingForLag(
  publishedAt: string | null,
  now: Date,
  lagHours: number,
): MetricAvailability {
  if (!publishedAt) return { kind: 'pending', reason: 'never-measured', availableAfter: null }
  const at = Date.parse(publishedAt)
  if (Number.isNaN(at)) {
    return { kind: 'pending', reason: 'never-measured', availableAfter: null }
  }
  const ready = at + lagHours * HOUR_MS
  if (now.getTime() < ready) {
    return { kind: 'pending', reason: 'lag', availableAfter: new Date(ready).toISOString() }
  }
  return { kind: 'pending', reason: 'never-measured', availableAfter: null }
}

/**
 * Zernio's `dataDelay` string ("48 hours", "2 days") as hours, when it says one.
 *
 * Preferred over the constants above so the platform's own statement wins. Anything
 * unparseable returns null and the caller falls back — a delay we misread would move
 * the "available yet?" boundary, which is the one thing this module must not get wrong.
 */
export function lagHoursFromDataDelay(dataDelay: string | undefined): number | null {
  if (!dataDelay) return null
  const match = /(\d+(?:\.\d+)?)\s*(hour|day)/i.exec(dataDelay)
  const amount = match?.[1]
  const unit = match?.[2]
  if (amount === undefined || unit === undefined) return null
  const value = Number(amount)
  if (!Number.isFinite(value)) return null
  return unit.toLowerCase() === 'day' ? value * 24 : value
}
