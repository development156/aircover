import type { MarketingObservation, ObservationDatum } from '@sahoda/shared'

/**
 * TONE DRIFT — "you have stopped using exclamation marks."
 *
 * ── WHY THIS ONE IS FIRST, OUT OF SIX ────────────────────────────────────────
 * docs/53 put it first because it is the cheapest impressive thing in the
 * product: it needs no migration to compute, no model call, and no data that is
 * not already stored. It is also the honest test of the whole idea. If a
 * customer reads a sentence assembled entirely from counting characters in their
 * own captions and finds it impressive rather than creepy, the Marketing Brain
 * is worth building; if they do not, that is worth knowing before a schema
 * exists to hold anything larger.
 *
 * ── THERE IS NO MODEL CALL IN THIS FILE, FOR THE REASON reflect.ts GIVES ─────
 * A claim about the CUSTOMER'S OWN BUSINESS is the one class of statement this
 * product may never invent, because a fabricated one is indistinguishable from a
 * true one to the person reading it. Computed here, the guarantee is structural:
 * this module imports no mesh, holds no port and cannot reach a provider. Every
 * number below is a count of characters in text the customer published.
 *
 * ── THE FLOORS ARE THE SUBSTANCE, NOT THE ARITHMETIC ─────────────────────────
 * Counting exclamation marks is trivial. Knowing when the count is worth saying
 * out loud is the whole feature. Four gates below, each with a different failure
 * it exists to prevent, and when one is not cleared this returns the REASON
 * rather than a softer version of the claim.
 */

/**
 * Posts per arm.
 *
 * Five, not the three `reflect.ts` uses. A performance comparison is between
 * measurements of the same act; this is a claim about somebody's WRITING HABIT,
 * and three captions is one campaign in one mood. A founder who wrote three
 * excited posts about an opening and then went back to normal has not changed
 * their voice, and telling them they have is the exact false note that would
 * make this feature feel like a horoscope.
 */
export const MIN_POSTS_PER_WINDOW = 5

/**
 * Days the two arms must span between them.
 *
 * A "drift" inside a fortnight is a fortnight, not a drift. Three weeks is the
 * shortest span over which "you used to, and now you do not" is a statement
 * about a habit rather than about a busy month.
 */
export const MIN_WINDOW_DAYS = 21

/**
 * The earlier arm's rate must reach this before a fall in it means anything.
 *
 * Without it, one exclamation mark across nine posts becoming zero across seven
 * is a "100% drop" and it is nothing of the kind: it is one character, from a
 * person who does not use them. This is the gate that stops the feature telling
 * a restrained writer they have become restrained.
 */
export const MIN_BASELINE_RATE = 0.5

/**
 * How far the rate must move, as a proportion of the higher arm.
 *
 * Six tenths, well above `reflect.ts`'s 0.25, because that threshold guards a
 * comparison between two channels measured the same way and this one guards a
 * claim about a person's character. The cost of being wrong is not a bad
 * recommendation, it is a customer deciding the product does not know them.
 */
export const MIN_RATE_CHANGE = 0.6

/** A published post, as this computation needs it. Nothing else is read. */
export interface PublishedPost {
  id: string
  /** The caption as published. */
  body: string
  /** ISO date, YYYY-MM-DD. */
  publishedOn: string
}

/** Why a window produced no observation. Each is a different sentence to the reader. */
export type NoDriftReason =
  /** Nothing has been published at all. */
  | 'no_posts'
  /** Posts exist, but not enough on one side of the split to compare. */
  | 'too_few_posts'
  /** Enough posts, all inside too short a span for "used to" to mean anything. */
  | 'window_too_short'
  /** The habit was never there, so it cannot have changed. */
  | 'no_baseline'
  /** The rate moved and the move is inside the noise of how anyone writes. */
  | 'change_too_small'

export interface ToneDriftResult {
  /** Present exactly when `reason` is null. */
  observation: MarketingObservation | null
  reason: NoDriftReason | null
}

/** The trait measured. Also the `subject` column, which is why it is one token. */
export const TONE_DRIFT_SUBJECT = 'exclamation_marks'

/** Exclamation marks in one caption. `!!!` is three, and counting it as one would understate. */
export function countExclamations(body: string): number {
  return (body.match(/!/g) ?? []).length
}

/** Days between two ISO dates, inclusive of both ends. */
function spanDays(earliest: string, latest: string): number {
  const ms = Date.parse(`${latest}T00:00:00Z`) - Date.parse(`${earliest}T00:00:00Z`)
  return Math.floor(ms / 86_400_000) + 1
}

/** Rate to one decimal, so a claim never prints sixteen digits. */
function rate(total: number, posts: number): number {
  if (posts === 0) return 0
  return Math.round((total / posts) * 10) / 10
}

/**
 * The sentence, assembled from the numbers.
 *
 * ── WHY THE FOUR SHAPES, AND WHY NONE OF THEM IS A TEMPLATE WITH A BLANK ─────
 * "None since" and "fewer than you did" are different claims, and rule 1 of the
 * copy canon says a sentence must never be vaguer than the truth it replaces. A
 * fall to exactly zero is the strongest and most checkable thing this
 * computation can say, so it gets its own sentence rather than being flattened
 * into "fewer". The rise direction is here for the same reason: a product that
 * only ever notices you have calmed down is a product with an opinion about
 * exclamation marks, and this one has none.
 */
function claimFor(before: number, after: number, earlierPosts: number, laterPosts: number): string {
  if (after === 0) {
    return (
      `You have stopped using exclamation marks. ${before} per post across your ` +
      `${earlierPosts} earlier posts, none in the ${laterPosts} since.`
    )
  }
  if (after < before) {
    return (
      `You use fewer exclamation marks than you did: ${before} per post across your ` +
      `${earlierPosts} earlier posts, ${after} in the ${laterPosts} since.`
    )
  }
  if (before === 0) {
    return (
      `You have started using exclamation marks. None across your ${earlierPosts} ` +
      `earlier posts, ${after} per post in the ${laterPosts} since.`
    )
  }
  return (
    `You use more exclamation marks than you did: ${before} per post across your ` +
    `${earlierPosts} earlier posts, ${after} in the ${laterPosts} since.`
  )
}

/**
 * What the published captions support about how this business writes now.
 *
 * `computedOn` is passed in rather than read from the clock: a pure function
 * that calls `new Date()` cannot be tested for the boundary it exists to guard,
 * and every other date in this codebase that a job writes is threaded the same
 * way for the same reason.
 */
export function toneDrift(posts: readonly PublishedPost[], computedOn: string): ToneDriftResult {
  // ── GATE 0: nothing was published ──────────────────────────────────────────
  if (posts.length === 0) return { observation: null, reason: 'no_posts' }

  const ordered = [...posts].sort((a, b) => a.publishedOn.localeCompare(b.publishedOn))
  const first = ordered[0]
  const last = ordered[ordered.length - 1]
  // `noUncheckedIndexedAccess` is on and it is right to insist: the emptiness
  // check above is a separate statement from these two reads.
  if (!first || !last) return { observation: null, reason: 'no_posts' }

  // ── GATE 1: the span must be long enough for "used to" to mean anything ────
  // Checked before the split, because a split of forty posts written in one week
  // produces two healthy-looking arms and no elapsed time at all.
  const windowDays = spanDays(first.publishedOn, last.publishedOn)
  if (windowDays < MIN_WINDOW_DAYS) return { observation: null, reason: 'window_too_short' }

  // Split at the median POSITION rather than the median date. A date split is
  // the more natural reading of "before and after", and it is the wrong one
  // here: a business that posted daily in spring and weekly since would get a
  // forty-post arm against a six-post one, and the six-post arm decides the
  // claim. Equal arms mean each sentence rests on the same weight of evidence.
  //
  // An odd count drops the MIDDLE post rather than lending it to one side. A
  // post counted in both arms appears on both sides of its own comparison, and
  // with small samples that single post can carry a claim over a gate.
  const half = Math.floor(ordered.length / 2)
  const earlier = ordered.slice(0, half)
  const later = ordered.slice(ordered.length - half)

  // ── GATE 2: each arm needs enough posts ────────────────────────────────────
  if (earlier.length < MIN_POSTS_PER_WINDOW || later.length < MIN_POSTS_PER_WINDOW) {
    return { observation: null, reason: 'too_few_posts' }
  }

  const earlierTotal = earlier.reduce((sum, p) => sum + countExclamations(p.body), 0)
  const laterTotal = later.reduce((sum, p) => sum + countExclamations(p.body), 0)
  const before = rate(earlierTotal, earlier.length)
  const after = rate(laterTotal, later.length)

  // ── GATE 3: the habit must have existed to have changed ───────────────────
  // Either direction: a rise from nothing is a real observation, a fall from
  // nothing is not. `Math.max` is what makes the gate directional-agnostic
  // without two branches that could drift apart.
  if (Math.max(before, after) < MIN_BASELINE_RATE) {
    return { observation: null, reason: 'no_baseline' }
  }

  // ── GATE 4: the move must be bigger than how anyone's writing wobbles ─────
  const higher = Math.max(before, after)
  const change = Math.abs(before - after) / higher
  if (change < MIN_RATE_CHANGE) return { observation: null, reason: 'change_too_small' }

  const data: ObservationDatum[] = [
    { label: 'Exclamation marks per post, earlier', value: before, unit: 'per_post' },
    { label: 'Exclamation marks per post, since', value: after, unit: 'per_post' },
    { label: 'Posts compared', value: earlier.length + later.length, unit: 'count' },
  ]

  return {
    reason: null,
    observation: {
      kind: 'tone_drift',
      subject: TONE_DRIFT_SUBJECT,
      claim: claimFor(before, after, earlier.length, later.length),
      evidence: {
        data,
        postIds: [...earlier, ...later].map((p) => p.id),
        windowDays,
      },
      computedOn,
    },
  }
}
