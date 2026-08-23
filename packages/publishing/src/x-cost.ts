/**
 * WHAT AN X POST COSTS, AND HOW MANY SAHODA WILL PAY FOR.
 *
 * ── THE PREMISE THIS WAS BUILT ON WAS OUT OF DATE ────────────────────────────
 * The brief asked for "the free tier is tiny — show remaining posts". There is no
 * free tier to count against any more. Checked against X's own documentation on
 * 2026-08-19:
 *
 *   · https://docs.x.com/x-api/introduction — "The X API uses pay-per-usage
 *     pricing. No subscriptions—pay only for what you use."
 *   · https://docs.x.com/x-api/getting-started/pricing — the price table below.
 *
 * X moved to pay-per-use as the default for new developers in February 2026. The
 * legacy Free / Basic / Pro tiers are closed to new signups. So there is no
 * X-imposed monthly write allowance left to render a "247 of 500 remaining" meter
 * against, and rendering one anyway would be a fabricated denominator — the exact
 * `100 of —` failure `docs/26_Design_System_v4.md` §4 names.
 *
 * What replaced it is worse for a marketing product, and that IS worth surfacing:
 * a post costs money every time, and a post CONTAINING A LINK costs 13.3× a plain
 * one. An SMB marketing post almost always contains a link.
 *
 * ── SO THE CAP IS SAHODA'S, AND IT SAYS SO ───────────────────────────────────
 * `MONTHLY_RATION` below is a POLICY NUMBER, not a measurement, and every surface
 * that renders it must attribute it to Sahoda rather than to X. It bounds the X
 * bill one workspace can run up. The used side of the meter is measured — real
 * `post_publish_logs` rows with `mode = 'live'` — so the fraction is honest in the
 * only way that matters: the numerator is a fact and the denominator is a declared
 * decision.
 */

/**
 * X's own numbers. Every one of these is quoted from X's documentation and none of
 * them is derived, averaged or rounded by us.
 *
 * Source: https://docs.x.com/x-api/getting-started/pricing (read 2026-08-19)
 */
export const X_API_PRICE_USD = {
  /** "Post: Create" — $0.015 per request. */
  createPost: 0.015,
  /** "Post: Create (with URL)" — $0.200 per request. 13.3× the plain rate. */
  createPostWithLink: 0.2,
} as const

/**
 * X's published rate limits for `POST /2/tweets`.
 *
 * Source: https://docs.x.com/x-api/fundamentals/rate-limits (read 2026-08-19)
 *
 * Recorded because they are the real ceiling on burst behaviour, and NOT used as
 * the ration: 100 posts per 15 minutes is a number no small business will ever
 * approach, so a meter against it would always read full and would teach the
 * reader that the meter means nothing.
 */
export const X_RATE_LIMIT = {
  perUserPer15Min: 100,
  perAppPer24Hours: 10_000,
} as const

/**
 * How many live X posts Sahoda will pay for, per workspace, per calendar month.
 *
 * ── 40 WAS A GUESS. THIS IS THE ARITHMETIC THAT REPLACED IT ──────────────────
 * The previous value said so itself: "a defensible starting ration, not a
 * researched one". Researched 2026-08-20 against X's own announcement of the
 * current rates (https://x.com/XDevelopers/status/2044919377544261979 — "API
 * Posting will increase to $0.015 per post from $0.01. API Posting URL will be
 * $0.20 except for summoned replies") and confirmed against
 * https://docs.x.com/x-api/introduction, which states pay-per-usage with no
 * subscription and lists no free tier.
 *
 * WHAT 40 COSTS, at the rate an SMB marketing post actually pays:
 *
 *     40 x $0.200  =  $8.00  per workspace per month   (every post carries a link)
 *     40 x $0.015  =  $0.60                            (no post carries a link)
 *
 * The first line is the real one. The brief for this product is small-business
 * marketing, and a marketing post without a link is the exception.
 *
 * WHAT $8.00 IS, AGAINST THE PLANS IN `@sahoda/shared`'s PLAN_CATALOG:
 *
 *     Free    $0/mo   ->  an $8.00 monthly LOSS per workspace
 *     Starter $12/mo  ->  67% of gross revenue, on one channel
 *     Growth  $29/mo  ->  27%
 *     Agency  $79/mo  ->  10%
 *
 * Sixty-seven per cent of an entry plan's revenue, spent on one channel, before
 * the aggregator fee that already dominates marginal cost and before a single
 * model call. That is not a ration; it is an unbounded liability with a number
 * written next to it.
 *
 * ── SO: TWELVE ──────────────────────────────────────────────────────────────
 *
 *     12 x $0.200  =  $2.40 worst case
 *       Free     an unfunded $2.40 -- still a loss, and still the wrong shape (below)
 *       Starter  20% of $12
 *       Growth    8% of $29
 *       Agency    3% of $79
 *
 * Twelve is about three X posts a week, which is a real SMB cadence rather than a
 * number chosen to be small. It keeps the worst case inside a fifth of the
 * cheapest paid plan, which leaves room for the per-connected-account aggregator
 * fee that is the larger cost on every other channel.
 *
 * ── AND THE HONEST CAVEAT: ONE CONSTANT IS THE WRONG SHAPE ───────────────────
 * A single global number has to be safe for the WEAKEST plan that can reach X,
 * and that plan is Free, where any number above zero is a loss. Twelve is the
 * best available answer while the ration is one constant; the right answer is a
 * per-plan ration on `PlanLimits`, where Free could be 0 and Agency 39 without
 * either being a compromise. That is a frozen-contract change and is NOT made
 * here.
 *
 * ⚠ STILL AN OWNER DECISION. Nothing here says what the business is willing to
 * spend — it says what the spend IS, so the decision can be made against numbers
 * instead of against a feeling. Zero live X posts have ever been sent
 * (`x-usage.ts`), so lowering this today refuses nothing that exists.
 */
export const X_MONTHLY_RATION = 12

/** What one X post will cost, given whether it carries a link. */
export function xPostPriceUsd(hasLink: boolean): number {
  return hasLink ? X_API_PRICE_USD.createPostWithLink : X_API_PRICE_USD.createPost
}

/**
 * The ration, answered.
 *
 * `used` MUST be a count of live sends. Passing a count of `publish_status =
 * 'published'` variants would be wrong in the one direction that matters: X holds
 * three such rows today and every one of them is a fixture that never left the
 * building, so a meter fed from there would report spend that did not happen and
 * would refuse a customer over money nobody paid.
 */
export interface XRationVerdict {
  /** False means: do not send, and do not spend anything on the way to finding out. */
  allowed: boolean
  used: number
  ration: number
  /** Never negative — a ration lowered below current usage reads as 0 left, not -3. */
  remaining: number
}

/**
 * ── THE RATION DOES NOT DEPEND ON THE PRICE, AND MUST NOT PRETEND TO ─────────
 * This deliberately takes no `hasLink`. The allowance is counted in POSTS, so
 * whether a given post costs $0.015 or $0.200 changes nothing about whether it
 * is allowed — and carrying a price on the verdict invited the caller to render
 * one. `PublishVariant.hasLink` is OPTIONAL, so on the publish path the honest
 * answer is often "we were not told", and a sentence quoting $0.20 off an
 * assumed link would be a fabricated figure in the one place this product may
 * never invent them.
 *
 * `xPostPriceUsd` is still exported for surfaces that KNOW the answer — the
 * /connections meter quotes both rates as X's published facts, not as a
 * prediction about one post.
 */
export function checkXRation(args: { used: number }): XRationVerdict {
  const used = Math.max(0, Math.trunc(args.used))
  const remaining = Math.max(0, X_MONTHLY_RATION - used)
  return { allowed: remaining > 0, used, ration: X_MONTHLY_RATION, remaining }
}

/**
 * The sentence a person reads when the ration refuses a post.
 *
 * Names the number, names whose number it is, and gives the one remedy that
 * actually works (wait, or send it somewhere else) rather than pointing at a
 * pricing page for a limit no plan currently lifts. Nothing here is a claim about
 * X: X did not refuse this post, Sahoda did.
 */
export function xRationRefusalMessage(verdict: XRationVerdict): string {
  return (
    `This workspace has used all ${verdict.ration} of its X posts for this month. ` +
    `X charges Sahoda for every post, so the rest are held until the month turns. ` +
    `nothing was sent and nothing was charged. Other channels are unaffected.`
  )
}

/** The code recorded on the refusal. Distinct from anything X itself returns. */
export const X_RATION_EXHAUSTED_CODE = 'X_MONTHLY_RATION_EXHAUSTED'

/**
 * First instant of the calendar month the ration is counted over, in UTC.
 *
 * Shared rather than reimplemented on both sides: `apps/web` renders the meter and
 * `apps/jobs` enforces it, and a window that disagreed by a timezone would show a
 * customer one number and refuse them on another. UTC because X bills in UTC and
 * because a workspace-local month would make the boundary a per-tenant question
 * nothing in the schema can answer.
 */
export function xRationWindowStart(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
}

/** Recorded when the ration itself could not be READ. Not the same as exhausted. */
export const X_RATION_UNREADABLE_CODE = 'X_MONTHLY_RATION_UNREADABLE'
