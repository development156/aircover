import { PLAN_CATALOG, describePlanPrice, type DisplayCurrency, type FxRates } from '@sahoda/shared'

import { creditWord } from '@/lib/credit-words'
import { RECOMMENDED_PLAN } from './recommended-plan'

/**
 * THE PLAN CARDS' CONTENT, BUILT ON THE SERVER.
 *
 * ── WHY THIS FILE EXISTS, AND IT IS A MEASUREMENT ────────────────────────────
 * The cards used to read `PLAN_CATALOG`, `describePlanPrice` and `creditWord`
 * themselves. They are a client component, so those VALUE imports pulled
 * `@sahoda/shared` into the browser bundle for /home — a route that had no
 * client-side reason to carry the contracts package before.
 * `scripts/perf/js-budget.mjs` failed the build on it: **760.0 kB against a
 * 670.8 kB budget, +89.2 kB**, after Clerk's own 140.8 kB had already been taken
 * out of the same route.
 *
 * The dashboard renders on the server and the catalog is right there, so the
 * rows are built here and travel as plain strings and numbers. Nothing about the
 * claim changes: every figure is still read off `PLAN_CATALOG` and there is
 * still not one written price anywhere. It is read one process earlier.
 *
 * A TYPE import from `@sahoda/shared` stays fine in the cards and costs nothing
 * — types are erased. It is the values that were expensive.
 */
export interface PlanOfferRow {
  /** The catalog id. `startCheckout` zod-parses it, so it crosses as a string. */
  id: string
  name: string
  /** Where this plan sits among the others. Derived, never written — see below. */
  position: string
  /** The price, already in the reader's currency, with the symbol. */
  price: string
  credits: string
  /** "credit" or "credits", agreed with the number beside it. */
  creditNoun: string
  includes: string[]
  recommended: boolean
}

/**
 * A one-line description DERIVED FROM THE PRICE ORDER rather than written.
 *
 * Every version of that sentence I could write ("for a growing shop", "for teams
 * that publish daily") is a claim about who a plan suits that nothing here
 * measures, and it would sit one line above a list that says the same thing in
 * facts. So it says the one thing that is true by construction: where the plan
 * sits among the others. Reprice the catalog and these follow.
 */
function position(index: number, total: number): string {
  if (index === 0) return 'The smallest paid plan.'
  if (index === total - 1) return 'The largest plan.'
  return 'The middle plan.'
}

/**
 * What a plan lifts besides credits, read off `limits`. The same three
 * dimensions the wallet panel shows, and deliberately not `loopLevel` or
 * `twinSize`: those are internal scales, not quantities a person buying a plan
 * can act on.
 */
function includes(limits: { channels: number; sites: number; seats: number }): string[] {
  const { channels, sites, seats } = limits
  return [
    `${channels} connected ${channels === 1 ? 'channel' : 'channels'}`,
    `${sites} published ${sites === 1 ? 'site' : 'sites'}`,
    `${seats} ${seats === 1 ? 'seat' : 'seats'}`,
  ]
}

/**
 * `free` is never a card: there is nothing to check out for, so it would be a
 * button that cannot mean anything. Sorted by price, which is also what makes
 * `position` above meaningful.
 */
export function planOfferRows(
  currency: DisplayCurrency | null = null,
  fx: FxRates | null = null,
): PlanOfferRow[] {
  const paid = Object.values(PLAN_CATALOG)
    .filter((plan) => plan.priceInr > 0)
    .sort((a, b) => a.priceInr - b.priceInr)

  return paid.map((entry, index) => ({
    id: entry.id,
    name: entry.name,
    position: position(index, paid.length),
    price: describePlanPrice(entry.priceInr, currency, fx).display,
    credits: entry.monthlyCredits.toLocaleString('en-IN'),
    creditNoun: creditWord(entry.monthlyCredits),
    includes: includes(entry.limits),
    recommended: entry.id === RECOMMENDED_PLAN,
  }))
}
