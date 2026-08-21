import { creditCost, type ActionType, type AutonomyLevel } from '@sahoda/shared'

/**
 * WHAT A PLAYBOOK RUN COSTS, BEFORE IT COSTS ANYTHING.
 *
 * ── WHY THIS IS THE MOST IMPORTANT FILE IN THE FEATURE ───────────────────────
 * A standing instruction that surprises someone with a bill is the worst failure
 * a Playbook can have. Everything else it gets wrong is recoverable by pressing
 * something; a charge is not — and unlike a button a person pressed, this one
 * can fire while they are asleep.
 *
 * ── EVERY PRICE IS A LOOKUP, NEVER A LITERAL ─────────────────────────────────
 * `creditCost()` reads pricing.config.json, which is the only place a credit
 * price exists in this product. A number typed here would be a second source of
 * truth for money and the two would disagree the first time a price moved — with
 * the preview showing one figure and the ledger charging another. There is not a
 * single numeric literal in the arithmetic below.
 */

/** PRD §7.2: "Playbook run — 2 credits". Charged once, when the run does work. */
export const RUN_ACTION: ActionType = 'playbook_run'

/**
 * WHAT ONE OUTPUT COSTS, AND WHY IT DEPENDS ON THE AUTONOMY DIAL.
 *
 * At L0 the item IS the suggestion. Nothing is drafted, no model is called, and
 * the honest price is zero — a preview quoting a figure there would be quoting
 * for work nobody does. At L1 and L2 a draft is written, and that is one
 * `post_variants` charge covering every channel of the post in one call, exactly
 * as the Loop prices a brief.
 *
 * Pricing per channel instead would quote four times the real figure for a
 * four-channel item. A preview that OVERSTATES is still a wrong preview, and it
 * pushes people to trim work they could comfortably afford.
 */
export function itemCost(outputAction: ActionType, level: AutonomyLevel): number {
  return level === 0 ? 0 : creditCost(outputAction)
}

/** What the run itself costs. A function, not a constant, so it reads the config live. */
export function runCost(): number {
  return creditCost(RUN_ACTION)
}

/** The shape the preview needs from an item. Narrow, so tests need no full row. */
export interface PricedItem {
  id: string
  position: number
  estimated_credits: number
  included: boolean
}

export interface RunCostPreview {
  /** What writing the included items will spend. */
  outputCredits: number
  /** The per-run charge. Counted in the total, and separately, because it is a
   *  different question: what a person is agreeing to versus what each line is. */
  runCredits: number
  /** Both together — the number a person is really agreeing to. */
  totalCredits: number
  includedCount: number
  excludedCount: number
  /** The balance available, or null when it could not be read. */
  availableCredits: number | null
  /** True when the total exceeds what the workspace can pay. */
  short: boolean
  /** How far short, or 0. Never negative. */
  shortBy: number
}

/**
 * Price a run exactly as the screen will show it.
 *
 * `availableCredits` is passed in rather than read here: this module is pure
 * arithmetic with no I/O, which is what lets the refusal copy be RENDERED in a
 * test rather than read off the source.
 */
export function previewRunCost(
  items: readonly PricedItem[],
  availableCredits: number | null,
): RunCostPreview {
  const included = items.filter((i) => i.included)
  const outputCredits = included.reduce((sum, i) => sum + i.estimated_credits, 0)
  const runCredits = runCost()
  const totalCredits = outputCredits + runCredits
  const short = availableCredits !== null && totalCredits > availableCredits
  return {
    outputCredits,
    runCredits,
    totalCredits,
    includedCount: included.length,
    excludedCount: items.length - included.length,
    availableCredits,
    short,
    shortBy: short ? totalCredits - (availableCredits ?? 0) : 0,
  }
}

/**
 * THE REFUSAL, IN WORDS, WITH BOTH NUMBERS AND THE PROMISE THAT NOTHING MOVED.
 *
 * ── WHY THE COPY LIVES HERE AND NOT IN THE COMPONENT ────────────────────────
 * Because this branch is the one a funded workspace never reaches, and therefore
 * the one nobody ever looks at. A peer lane shipped "needs 1 credits" into
 * exactly this corner: a plural welded to a figure that is usually plural, in a
 * sentence only an empty wallet ever sees.
 *
 * As a pure function of two numbers it can be RENDERED in a test at one credit
 * and at many, which is the only way that defect gets caught before a customer
 * finds it. `cost.test.ts` asserts both.
 */
export function shortfallMessage(needed: number, available: number): string {
  const credits = (n: number): string => `${n} ${n === 1 ? 'credit' : 'credits'}`
  return `This run needs ${credits(needed)} and your workspace has ${credits(available)}. Nothing was charged.`
}
