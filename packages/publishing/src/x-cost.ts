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
 * ── HOW THIS NUMBER WAS CHOSEN, SO IT CAN BE ARGUED WITH ─────────────────────
 * At the with-a-link rate of $0.200, 40 posts is a worst case of **$8.00 per
 * workspace per month** of X spend. That is the whole derivation; there is no
 * modelling behind it and it is not tuned to observed usage, because there is no
 * observed usage — zero live X posts have ever been sent (see `x-usage.ts`).
 *
 * ⚠ THIS NEEDS AN OWNER DECISION before X publishing is switched on. It is a
 * defensible starting ration, not a researched one, and it is deliberately in one
 * named constant so changing it is a one-line decision rather than an excavation.
 */
export const X_MONTHLY_RATION = 40

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
    `X charges Sahoda for every post, so the rest are held until the month turns — ` +
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
