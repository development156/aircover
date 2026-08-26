import type { MarketingObservation } from '@sahoda/shared'

/**
 * EDIT DISTANCE — "you are rewriting less of what Sahoda drafts."
 *
 * ── WHAT THIS MEASURES, AND WHY IT IS THE HONEST ONE ─────────────────────────
 * `posts.generated_body` holds the words a model produced, write-once;
 * `posts.body` holds what the customer made of them. The gap between the two is
 * the only signal in this product that a competitor cannot reproduce, because it
 * exists only where Sahoda wrote the draft first (REQUESTS.md §22).
 *
 * §22 also names the measure that keeps it from becoming decorative: the average
 * distance should FALL over months. If it does not, nothing here says it did.
 *
 * ── NO MODEL CALL, FOR THE REASON `tone-drift.ts` GIVES ──────────────────────
 * A claim about the customer's own business is the one class of statement this
 * product may never invent. This module imports no mesh, holds no port and
 * cannot reach a provider. Every number below counts characters in stored text.
 *
 * ── THE TWO THINGS THAT WOULD MAKE THIS LIE ──────────────────────────────────
 * 1. Counting a post with NO captured draft as a zero-distance post. That is a
 *    post a person typed themselves, and scoring it as "Sahoda got it perfect"
 *    would drag the average down and manufacture an improvement out of the
 *    product being used less. Such rows are EXCLUDED, never defaulted.
 * 2. Claiming on a RISE. A distance that grows is a real finding, and it is not
 *    one to put in front of a customer as though it were progress. It declines
 *    with `not_improving`, which is a different sentence from having no data.
 */

/** A post with a captured model draft. Rows without one never reach here. */
export interface CapturedPost {
  id: string
  /** The body as a model first produced it. */
  generatedBody: string
  /** The body as it stands now, after any edit. */
  body: string
  /** ISO date, YYYY-MM-DD. When the post was created. */
  createdOn: string
}

/** Why a window produced no observation. Each is a different sentence to the reader. */
export type NoDeltaReason =
  /** No post anywhere carries a model draft, so nothing can be compared. */
  | 'no_captured_drafts'
  /** Drafts exist, but not enough on one side of the split. */
  | 'too_few_posts'
  /** Enough posts, all inside too short a span for "used to" to mean anything. */
  | 'window_too_short'
  /** The average moved and the move is inside the noise of ordinary editing. */
  | 'change_too_small'
  /** The average ROSE. A real finding, and never dressed up as an improvement. */
  | 'not_improving'

export interface EditDistanceResult {
  /** Present exactly when `reason` is null. */
  observation: MarketingObservation | null
  reason: NoDeltaReason | null
}

/** The trait measured. Also the `subject` column, which is why it is one token. */
export const EDIT_DISTANCE_SUBJECT = 'rewrite_effort'

/**
 * Posts per arm. Five, matching `tone-drift.ts` and for the same reason: a claim
 * about a HABIT cannot rest on three posts written in one mood.
 */
export const MIN_POSTS_PER_WINDOW = 5

/** Days the two arms must span between them. Below three weeks, "used to" is not a claim. */
export const MIN_WINDOW_DAYS = 21

/**
 * The fall in normalised distance that counts as a fall.
 *
 * 0.05 of the text is roughly one reworded phrase in a caption. Below that, the
 * difference between two averages is which posts happened to land in which arm.
 */
export const MIN_DISTANCE_CHANGE = 0.05

/**
 * The earlier arm must show at least this much rewriting before a fall means
 * anything. Without it, a customer who already accepted drafts almost verbatim
 * gets told they have improved, when what changed was rounding.
 */
export const MIN_BASELINE_DISTANCE = 0.1

/**
 * Longest text this compares, in characters.
 *
 * Levenshtein is O(n·m). Captions are short, but `body` is unbounded upstream
 * and a pasted essay would make the weekly pass quadratic in it. Both sides are
 * cut to this before comparing. It is a bound on COST, and it is stated in the
 * evidence rather than hidden, because a truncated comparison is a different
 * measurement from a whole one.
 */
export const MAX_COMPARE_CHARS = 4000

/**
 * Levenshtein distance, two rows rather than a full matrix.
 *
 * The full matrix is the textbook version and it allocates n·m numbers to
 * produce one. Only the previous row is ever read, so two rows is the same
 * arithmetic in linear memory.
 */
export function levenshtein(a: string, b: string): number {
  const s = a.length > MAX_COMPARE_CHARS ? a.slice(0, MAX_COMPARE_CHARS) : a
  const t = b.length > MAX_COMPARE_CHARS ? b.slice(0, MAX_COMPARE_CHARS) : b
  if (s === t) return 0
  if (s.length === 0) return t.length
  if (t.length === 0) return s.length

  let prev = Array.from({ length: t.length + 1 }, (_, i) => i)
  let curr = new Array<number>(t.length + 1)

  for (let i = 1; i <= s.length; i += 1) {
    curr[0] = i
    for (let j = 1; j <= t.length; j += 1) {
      const substitution = (prev[j - 1] as number) + (s[i - 1] === t[j - 1] ? 0 : 1)
      const deletion = (prev[j] as number) + 1
      const insertion = (curr[j - 1] as number) + 1
      curr[j] = Math.min(substitution, deletion, insertion)
    }
    const swap = prev
    prev = curr
    curr = swap
  }

  return prev[t.length] as number
}

/**
 * Distance as a share of the longer text, so a caption and an essay are
 * comparable. Two empty strings are identical, which is 0 and not a division by
 * zero.
 */
export function normalisedDistance(generated: string, edited: string): number {
  const longest = Math.min(Math.max(generated.length, edited.length), MAX_COMPARE_CHARS)
  if (longest === 0) return 0
  return levenshtein(generated, edited) / longest
}

/** Whole days between two YYYY-MM-DD dates. */
function spanDays(from: string, to: string): number {
  const ms = Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)
  return Math.round(ms / 86_400_000)
}

/** Two decimals, so evidence carries a figure a person can read aloud. */
function round(value: number): number {
  return Math.round(value * 100) / 100
}

function mean(values: readonly number[]): number {
  if (values.length === 0) return 0
  return values.reduce((sum, v) => sum + v, 0) / values.length
}

export function editDistance(
  posts: readonly CapturedPost[],
  computedOn: string,
): EditDistanceResult {
  // ── GATE 0: nothing was ever drafted by a model ────────────────────────────
  if (posts.length === 0) return { observation: null, reason: 'no_captured_drafts' }

  const ordered = [...posts].sort((a, b) => a.createdOn.localeCompare(b.createdOn))
  const first = ordered[0]
  const last = ordered[ordered.length - 1]
  if (!first || !last) return { observation: null, reason: 'no_captured_drafts' }

  // ── GATE 1: the span must be long enough for "used to" to mean anything ────
  // Before the split, because forty posts written in one week produce two
  // healthy-looking arms and no elapsed time at all.
  const windowDays = spanDays(first.createdOn, last.createdOn)
  if (windowDays < MIN_WINDOW_DAYS) return { observation: null, reason: 'window_too_short' }

  // Split at the median POSITION, and drop the middle post on an odd count, for
  // the reasons `tone-drift.ts` sets out: equal arms weigh the same, and a post
  // lent to both sides appears on both sides of its own comparison.
  const half = Math.floor(ordered.length / 2)
  const earlier = ordered.slice(0, half)
  const later = ordered.slice(ordered.length - half)

  // ── GATE 2: each arm needs enough posts ────────────────────────────────────
  if (earlier.length < MIN_POSTS_PER_WINDOW || later.length < MIN_POSTS_PER_WINDOW) {
    return { observation: null, reason: 'too_few_posts' }
  }

  const distanceOf = (p: CapturedPost) => normalisedDistance(p.generatedBody, p.body)
  const before = mean(earlier.map(distanceOf))
  const after = mean(later.map(distanceOf))

  // ── GATE 3: there must have been real rewriting to begin with ──────────────
  if (before < MIN_BASELINE_DISTANCE) return { observation: null, reason: 'no_captured_drafts' }

  // ── GATE 4: the direction. A rise is reported as a rise, never as progress ─
  if (after >= before) return { observation: null, reason: 'not_improving' }

  // ── GATE 5: the fall must be bigger than the noise ─────────────────────────
  if (before - after < MIN_DISTANCE_CHANGE) return { observation: null, reason: 'change_too_small' }

  const beforePct = Math.round(before * 100)
  const afterPct = Math.round(after * 100)

  return {
    reason: null,
    observation: {
      kind: 'edit_distance',
      subject: EDIT_DISTANCE_SUBJECT,
      // Stated as what the customer DID, not as what Sahoda achieved. They did
      // the editing; the falling number is a fact about their drafts, and
      // claiming it as the product's win is the kind of sentence §22 warns about.
      claim: `You are changing less of what Sahoda drafts: about ${afterPct}% of a caption lately, against ${beforePct}% earlier.`,
      evidence: {
        data: [
          { label: 'Share of the draft rewritten, earlier', value: round(before), unit: 'ratio' },
          { label: 'Share of the draft rewritten, since', value: round(after), unit: 'ratio' },
          { label: 'Posts compared', value: earlier.length + later.length, unit: 'count' },
        ],
        postIds: [...earlier, ...later].map((p) => p.id),
        windowDays,
      },
      computedOn,
    },
  }
}
