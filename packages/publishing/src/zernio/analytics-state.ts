import type { Channel } from '@sahoda/shared'

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
 * How far behind a channel reports POST-level metrics — or an admission that we
 * do not know.
 *
 * ── WHY IGNORANCE IS MODELLED INSTEAD OF GUESSED ─────────────────────────────
 * The account endpoints state their own delay in a `dataDelay` string, and it is
 * preferred over any constant. The POST endpoint carries no such field: verified
 * against all eight live posts on 2026-08-11, `dataDelay` is absent from every one.
 * Nothing else in this repo states a post-level window for x, gbp or linkedin.
 *
 * A number invented for them would move the "available yet?" boundary, which is
 * the single thing this module must not get wrong — and it would move it in the
 * dangerous direction. See `classifyPostMetrics` rule 6a: the window is what
 * licenses a zero to be called a measurement. Guessing "linkedin: 0" does not
 * merely mis-date a wait, it converts every all-zero LinkedIn payload into a
 * rendered "0 impressions".
 *
 * So the type has no third option, and `known: false` carries no hours to misuse.
 */
export type ReportingWindow = { known: true; lagHours: number } | { known: false }

/** The one unknown value, shared so it compares by structure everywhere. */
export const UNKNOWN_WINDOW: ReportingWindow = { known: false }

/**
 * What we know per channel, and nothing more.
 *
 * Instagram is the only entry with a number, and it is not a guess: it is the
 * documented 48h that `dataDelay` states verbatim on the account endpoints, and
 * that the 2026-08-10 recordings show the post endpoint behaving consistently with.
 *
 * The other three are `known: false` because they are unknown, not because they
 * are zero. If Zernio ever adds `dataDelay` to the post payload, prefer it over
 * this table exactly as `account-insights.ts` does — the platform's own statement
 * always wins over a constant.
 */
export const CHANNEL_REPORTING_WINDOW: Readonly<Record<Channel, ReportingWindow>> = {
  instagram: { known: true, lagHours: INSTAGRAM_INSIGHTS_LAG_HOURS },
  x: UNKNOWN_WINDOW,
  gbp: UNKNOWN_WINDOW,
  linkedin: UNKNOWN_WINDOW,
  // UNKNOWN for both, and that is the honest entry rather than a placeholder.
  // `UNKNOWN_WINDOW` means "we have not measured this channel's reporting lag",
  // and the reader renders an absence mark instead of a figure. Copying
  // Instagram's measured lag across would put a number on screen that no
  // observation supports.
  facebook: UNKNOWN_WINDOW,
  telegram: UNKNOWN_WINDOW,
}

export function reportingWindowFor(channel: Channel): ReportingWindow {
  return CHANNEL_REPORTING_WINDOW[channel] ?? UNKNOWN_WINDOW
}

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
  /**
   * When Zernio last synced these numbers, as ISO-8601 UTC.
   *
   * NOT "when the platform measured them", and the difference is not pedantry: the
   * same stamp comes back for every post in a sweep (see rule 6a). It is safe to print
   * as "last updated" and unsafe to reason about as a per-post measurement time.
   *
   * Normalised by `normaliseMeasuredAt` — the wire format is unzoned.
   */
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
       * `unknown-window` — the channel reported nothing but zeroes and we do not
       *                    know how far behind it reports, so the zeroes cannot be
       *                    called a measurement and the wait cannot be dated.
       *                    Distinct from `never-measured`, which claims the channel
       *                    reported nothing at all — here it reported, unusably.
       */
      reason: 'processing' | 'lag' | 'never-measured' | 'unknown-window'
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
 * The raw counts Zernio reports. Derived figures (`engagementRate`) are deliberately
 * excluded — a rate is computed FROM these, so it carries no independent evidence that
 * anything was measured.
 */
const COUNT_FIELDS = [
  'impressions',
  'reach',
  'likes',
  'comments',
  'shares',
  'saves',
  'clicks',
  'views',
  'follows',
] as const

/**
 * Did Zernio report counts, and were every one of them zero?
 *
 * "Reported" means present as a finite number. An ABSENT field and a field reported as
 * 0 must not collapse together here: absent is already Rule 6's business, and treating
 * it as a zero would make an empty bag look like a measurement of nothing.
 *
 * False when nothing was reported at all, so a payload with no counts falls through to
 * the rules that handle emptiness rather than being caught by this one.
 */
function reportedAllZero(metrics: Record<string, unknown>): boolean {
  const present = COUNT_FIELDS.map((field) => num(metrics[field])).filter(
    (value): value is number => value !== null,
  )
  return present.length > 0 && present.every((value) => value === 0)
}

/**
 * Zernio's `lastUpdated` as ISO-8601 UTC.
 *
 * It arrives as `2026-08-10 09:38:57` — space-separated and with no zone — which is not
 * the ISO-8601 `PostMetrics.measuredAt` promises. That matters because the copy layer
 * hands the value straight to `new Date(...)`: V8 reads an unzoned string as LOCAL time,
 * so "Last updated" silently shifts by the server's offset, and Safari returns NaN.
 *
 * Anything already zoned, or in any shape this does not recognise, is passed through
 * untouched — a timestamp we cannot confidently re-interpret is left as it came rather
 * than being relabelled UTC on a guess.
 */
const UNZONED = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})(\.\d+)?$/

export function normaliseMeasuredAt(raw: string): string {
  const match = UNZONED.exec(raw.trim())
  if (!match) return raw
  return `${match[1]}T${match[2]}${match[3] ?? ''}Z`
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
   *
   * REQUIRED, for the same reason `ResolvedConnection.viaZernio` is. It shipped optional
   * on 2026-08-09 and one of the two call sites already omitted it; that omission was
   * harmless only because `post-metrics.ts` filters out rows with no `platformPostId`
   * and `variant-status.ts` erases a fixture's id — i.e. the safety lived in a different
   * module than the assumption. Required makes the omission a compile error instead.
   */
  simulated: boolean
  /** When this channel went out, ISO-8601. Null when unknown. */
  publishedAt: string | null
  now: Date
  /**
   * How far behind THIS channel reports, or that we do not know.
   *
   * REQUIRED, and deliberately so. It shipped as `lagHours?: number` defaulting to
   * Instagram's 48, and `listPostMetrics` — the caller that classifies every channel
   * of every post in the app — never passed one. Every X, GBP and LinkedIn post was
   * therefore measured against Instagram's window, silently, and a LinkedIn post
   * went live on 2026-08-10 with that defect in place.
   *
   * The same lesson as `simulated` above: an optional input with a plausible default
   * is an omission nobody sees. Required makes it a compile error.
   */
  window: ReportingWindow
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
 *   6. no measuredAt      — no `lastUpdated` at all means nothing has been synced, so
 *                           its absence is decisive regardless of what the numbers say.
 *   6a. all-zero, in-window — every count Zernio reported was 0 AND the platform's
 *                           reporting window has not closed yet. See below.
 *   7. ready              — and only here can a number reach the screen.
 *
 * ── WHY 6a EXISTS: `lastUpdated` IS A POLL STAMP ─────────────────────────────
 * Rule 6 used to be the whole guard, on the stated premise that `lastUpdated` was "the
 * only proof a measurement happened". A live sweep on 2026-08-10 disproved it. Four
 * posts published 17h, 41m, 36m and 26m earlier all came back carrying the SAME
 * `lastUpdated` — `2026-08-10 09:38:57`. A timestamp identical across posts published
 * seventeen hours apart records when ZERNIO LAST POLLED, not when each was measured.
 *
 * So its presence proves a sync ran, nothing more, and three of those four posts were
 * classified `ready` with every metric 0 — the precise failure this module exists to
 * prevent, reached through the field trusted to prevent it.
 *
 * 6a restores the guarantee without over-correcting. It fires only when BOTH hold, and
 * each half is load-bearing:
 *   · all counts zero — a non-zero reading cannot be fabricated by a poll, so an early
 *     2 impressions is real and must still show. Demoting it would hide data the
 *     customer has, which is the same lie pointing the other way.
 *   · window still open — past the window a zero is a genuine measurement of nothing,
 *     and saying "check back" forever would be its own falsehood. The rule is never a
 *     zero we cannot justify, not never a zero.
 *
 * ── AND WHEN THERE IS NO WINDOW TO CHECK ─────────────────────────────────────
 * "Past the window" is only sayable about a channel whose window we know, and we know
 * exactly one (see `CHANNEL_REPORTING_WINDOW`). For the rest, an all-zero payload is
 * permanently unjustifiable — not because the data is late, but because we cannot tell
 * late from measured. That case reports `unknown-window` and does not expire.
 *
 * This is the narrower of the two available falsehoods, chosen deliberately. Withholding
 * an unverifiable zero costs the customer a number that was never evidence of anything;
 * printing it tells them their post reached nobody. Only the second is a claim.
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
  const { window } = input

  // Rule 6. Nothing synced at all, which is decisive on its own: the channel has
  // reported NOTHING, and that sentence is true whether or not we know its window.
  // So an unknown window keeps the plainer `never-measured` here rather than
  // borrowing `unknown-window`, which claims something was reported unusably.
  if (!analytics || typeof measuredAt !== 'string' || measuredAt === '') {
    return window.known
      ? pendingForLag(publishedAt, now, window.lagHours)
      : { kind: 'pending', reason: 'never-measured', availableAfter: null }
  }

  const raw = analytics as unknown as Record<string, unknown>

  // Rule 6a — see the precedence note above. All-zero counts inside the reporting
  // window are the sync stamp's zeroes, not the platform's answer.
  if (reportedAllZero(raw)) {
    // No window means no way to earn the zero. The window is what licenses a zero
    // to be called a measurement ("it has had its 48 hours"), and without one that
    // sentence cannot be said at any age — so this does not expire into `ready`.
    // It withholds a zero, never a number: a non-zero reading never reaches here.
    if (!window.known) {
      return { kind: 'pending', reason: 'unknown-window', availableAfter: null }
    }
    const lagged = pendingForLag(publishedAt, now, window.lagHours)
    if (lagged.kind === 'pending' && lagged.reason === 'lag') return lagged
  }

  return {
    kind: 'ready',
    metrics: {
      impressions: num(raw.impressions),
      reach: num(raw.reach),
      engagement: engagementOf(raw),
      engagementRate: num(raw.engagementRate),
      measuredAt: normaliseMeasuredAt(measuredAt),
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
