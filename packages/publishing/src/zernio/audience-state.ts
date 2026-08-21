import { ZernioError } from './client'
import type { ZernioDemographicBucket, ZernioInstagramDemographics } from './reads'

/**
 * What an audience read is ALLOWED to claim, decided before anything renders.
 *
 * ── WHY THIS FILE EXISTS, AND IT IS NOT THE REASON ITS SIBLING EXISTS ────────
 * `analytics-state.ts` exists because Zernio answers with ZEROES where nothing was
 * measured. This one exists because Zernio answers with an EMPTY ARRAY in at least
 * four different situations that need four different sentences:
 *
 *   1. the account has fewer than 100 followers, so Meta withholds demographics.
 *      Nothing is wrong. It will appear as they grow.
 *   2. the account is big enough and Meta genuinely reported nothing for the window.
 *   3. the call never happened — no key in this deployment.
 *   4. the call failed, or the account no longer resolves.
 *
 * MEASURED 2026-08-20, and this is the fact the whole module is shaped around: case 1
 * arrives as **HTTP 200, `success: true`, `demographics: {age:[],city:[],country:[],
 * gender:[]}`**. It is byte-indistinguishable from case 2. Zernio's OpenAPI documents
 * a 400 `instagram_insufficient_followers` for it; that error did not fire against a
 * real account holding 1 follower.
 *
 * So SUPPRESSION IS NOT SOMETHING THE READ REPORTS. It is something we may conclude
 * only with the follower count in hand — and this module refuses to conclude it
 * otherwise. That refusal is the feature: this repo has shipped "one empty value for
 * two different states" four times (see `e2e/no-impossible-remedy.spec.ts`), and every
 * one of them told a healthy new account that something had failed.
 *
 * Pure: no I/O, no clock, no React. Every input is passed in.
 */

/**
 * Meta's floor for demographic insights.
 *
 * CONFIRMED FROM BOTH SIDES 2026-08-20 rather than carried over from a brief:
 *   · Meta — "Not returned if the IG User has less than 100 followers."
 *     (Instagram Platform API reference, Instagram User Insights.)
 *   · Zernio — "Requires at least 100 followers", stated in its OpenAPI description
 *     AND echoed in the `note` field of every live 200 response.
 *
 * It is a floor on the FOLLOWER count specifically, and it applies to
 * `engaged_audience_demographics` as well — an account with 40 followers and a viral
 * post still gets nothing.
 */
export const DEMOGRAPHICS_FOLLOWER_FLOOR = 100

/** The four dimensions Meta breaks an Instagram audience down by. Nothing else. */
export const AUDIENCE_DIMENSIONS = ['age', 'gender', 'city', 'country'] as const
export type AudienceDimension = (typeof AUDIENCE_DIMENSIONS)[number]

/** Which population was asked about. Two different things; never merged. */
export type AudiencePopulation = 'followers' | 'engaged'

export const POPULATION_METRIC: Readonly<Record<AudiencePopulation, string>> = {
  followers: 'follower_demographics',
  engaged: 'engaged_audience_demographics',
}

/** One bucket, narrowed. A bucket that could not be narrowed never becomes a zero. */
export interface AudienceBucket {
  label: string
  value: number
}

/** Every dimension the platform reported, keyed. A dimension with no buckets is absent. */
export type AudienceBreakdown = Partial<Record<AudienceDimension, AudienceBucket[]>>

/**
 * Why an audience cannot be shown, or that it can.
 *
 * `suppressed` will resolve on its own as the account grows; `no-data` may or may
 * not; `not-configured`, `unresolved` and `unreadable` need someone to act. The
 * split matters because the copy differs, and because three of these must never
 * offer "try again" — retrying cannot add followers, cannot supply a missing
 * environment variable and cannot reconnect an account.
 */
export type AudienceState =
  | {
      kind: 'ready'
      breakdown: AudienceBreakdown
      /** What the platform said the figures cover — its own word, unaltered. */
      timeframe: string | null
      /**
       * The account total, when it is known.
       *
       * Kept beside the breakdown because Meta returns only the TOP 45 buckets per
       * dimension, so the buckets DO NOT ADD UP TO THE WHOLE. A share computed
       * against their sum would be a number no platform ever reported. Any
       * percentage on screen is computed against this, and is omitted when this is
       * null.
       */
      followers: number | null
    }
  /**
   * Meta withholds demographics below its follower floor. The account is fine.
   *
   * Only reachable with a follower count in hand — see the note at the top. Carries
   * the count and the floor so the screen can state both rather than assert a rule.
   */
  | { kind: 'suppressed'; followers: number; floor: number }
  /**
   * The platform answered and reported nothing, and the follower count does not
   * explain it.
   *
   * A separate state from `suppressed` because it is a DIFFERENT CLAIM: there, the
   * account is below a documented threshold and the wait is explicable; here, we
   * genuinely do not know why. Merging them would let the screen tell a
   * two-thousand-follower account that it is too small.
   *
   * `followers` is null when the count could not be read — which is itself why this
   * state and not `suppressed`, and the copy has to survive that reading too.
   */
  | { kind: 'no-data'; followers: number | null; timeframe: string | null }
  /** No account connected. Nothing was attempted and nothing failed. */
  | { kind: 'not-connected' }
  /** There is a connection, and it is not active. "Connect" is useless advice here. */
  | { kind: 'reconnect' }
  /** No key in this deployment. No request went out. Retrying cannot conjure one. */
  | { kind: 'not-configured' }
  /** The platform answered and could not tie this id to a live account. Permanent. */
  | { kind: 'unresolved' }
  /** The call failed. OURS to fix, and the only state where "try again" is honest. */
  | { kind: 'unreadable' }

/** A finite number, or nothing. Never a coerced 0, and never a negative count. */
function count(raw: unknown): number | null {
  return typeof raw === 'number' && Number.isFinite(raw) && raw >= 0 ? raw : null
}

/**
 * Narrow one dimension's buckets.
 *
 * A bucket whose label is not a non-empty string, or whose value is not a
 * non-negative finite number, is DROPPED. Dropping shortens a list; coercing would
 * invent a segment of somebody's audience, and only one of those is visible later.
 *
 * A bucket reported as 0 is KEPT: the platform said zero, and that is a measurement.
 */
export function bucketsFrom(raw: unknown): AudienceBucket[] {
  if (!Array.isArray(raw)) return []
  const out: AudienceBucket[] = []
  for (const item of raw as ZernioDemographicBucket[]) {
    if (typeof item !== 'object' || item === null) continue
    const label = (item as { dimension?: unknown }).dimension
    const value = count((item as { value?: unknown }).value)
    if (typeof label !== 'string' || label.trim() === '' || value === null) continue
    out.push({ label, value })
  }
  return out
}

/**
 * Every dimension that carried at least one usable bucket.
 *
 * A dimension present as `[]` is ABSENT from the result, not present-and-empty. That
 * is the point: `Object.keys(breakdown).length === 0` is then a single, honest test
 * for "the platform reported nothing", and no caller has to remember to check each
 * of the four separately. A guard written against `age` alone is exactly how the
 * sibling-shape defects in this repo got shipped.
 */
export function breakdownFrom(payload: ZernioInstagramDemographics): AudienceBreakdown {
  const raw = payload.demographics
  if (typeof raw !== 'object' || raw === null) return {}
  const out: AudienceBreakdown = {}
  for (const dimension of AUDIENCE_DIMENSIONS) {
    const buckets = bucketsFrom(raw[dimension])
    if (buckets.length > 0) out[dimension] = buckets
  }
  return out
}

export interface ClassifyAudienceInput {
  /** The payload, or the error the call threw. Exactly one of them. */
  result: { ok: true; payload: ZernioInstagramDemographics } | { ok: false; error: unknown }
  /**
   * The account's current follower count, from a DIFFERENT endpoint, or null.
   *
   * Required as a parameter rather than read here so that "we do not know" is a
   * value this function must be handed and cannot quietly manufacture.
   */
  followers: number | null
  floor?: number
}

/**
 * The single place an audience read becomes a claim.
 *
 * Ordered so that the states which need no follower count are settled first — a
 * failed call says nothing at all about how many followers an account has, and
 * asking that question of a thrown request is how a transport error turns into
 * "you're too small".
 */
export function classifyAudience(input: ClassifyAudienceInput): AudienceState {
  const floor = input.floor ?? DEMOGRAPHICS_FOLLOWER_FLOOR

  if (!input.result.ok) return classifyFailure(input.result.error)

  const payload = input.result.payload
  const breakdown = breakdownFrom(payload)
  const timeframe = typeof payload.timeframe === 'string' ? payload.timeframe : null

  if (Object.keys(breakdown).length > 0) {
    return { kind: 'ready', breakdown, timeframe, followers: input.followers }
  }

  // Nothing reported. The follower count is the ONLY thing that can explain it, and
  // without one this stays `no-data` — an admission, not a diagnosis.
  if (input.followers !== null && input.followers < floor) {
    return { kind: 'suppressed', followers: input.followers, floor }
  }
  return { kind: 'no-data', followers: input.followers, timeframe }
}

/**
 * A thrown call, by what the platform actually said.
 *
 * Every branch is a status and a code observed on the wire, not a guess:
 *   402 / `analytics_addon_required`  the key's plan does not include analytics
 *   404 / `account_not_found`         Zernio cannot resolve this id  [LIVE 2026-08-20]
 *   403                               the key may not read this account
 * Anything else — a timeout, a 5xx, an HTML page from the wrong host — is ours.
 */
function classifyFailure(error: unknown): AudienceState {
  if (!(error instanceof ZernioError)) return { kind: 'unreadable' }
  if (error.status === 402) return { kind: 'not-configured' }
  if (error.status === 404 || error.code === 'account_not_found') return { kind: 'unresolved' }
  if (error.status === 403) return { kind: 'unresolved' }
  return { kind: 'unreadable' }
}

/**
 * Is this state one a "try again" may be offered against?
 *
 * Exactly one is. Exported so a screen cannot re-derive the rule and get it wrong,
 * and so a test can assert the answer for every member of the union rather than for
 * the one that happened to be on someone's mind.
 */
export function mayOfferRetry(state: AudienceState): boolean {
  return state.kind === 'unreadable'
}
