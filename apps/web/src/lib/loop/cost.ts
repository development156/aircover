import { creditCost, type ActionType } from '@sahoda/shared'

import type { LoopBrief } from '@sahoda/shared'

/**
 * THE COST PREVIEW — every credit the cycle will spend, before it spends any.
 *
 * ── WHY THIS IS THE MOST IMPORTANT FILE IN THE LOOP ──────────────────────────
 * A cycle that surprises someone with a bill is the worst failure this feature
 * can have. Everything else it gets wrong is recoverable by pressing something;
 * a charge is not. FSD M2 puts the preview before stage 4 and this module is
 * what fills it.
 *
 * ── EVERY PRICE IS A LOOKUP, NEVER A LITERAL ─────────────────────────────────
 * `creditCost()` reads pricing.config.json, which is the only place a credit
 * price exists in this product. A number typed here would be a second source of
 * truth for money, and the two would disagree the first time a price moved —
 * with the preview showing one figure and the ledger charging another. There is
 * not a single numeric literal in the arithmetic below.
 */

/**
 * What one brief costs to turn into drafts.
 *
 * ONE `post_variants` CHARGE PER BRIEF, NOT PER CHANNEL. `generateVariants`
 * takes a single flat charge and produces a variant for every channel of the
 * post in one call (apps/web `actions/posts-ai.ts`), so a brief targeting four
 * channels costs exactly what a brief targeting one costs. Pricing it per
 * channel would quote four times the real figure — a preview that overstates is
 * still a wrong preview, and it would push people to trim work they could
 * afford.
 */
export const BRIEF_ACTION: ActionType = 'post_variants'

/**
 * The orchestration charge, covering collect, reflect, plan and report.
 *
 * This is the same key `plan_week` already charges under (`MESH_TASK_ACTION`),
 * and that is correct rather than a collision: planning the week IS the paid
 * part of the orchestration, and the cycle does not charge twice for one plan.
 */
export const CYCLE_ACTION: ActionType = 'loop_cycle'

/** FSD M2: regenerating the plan is its own price. */
export const REGENERATE_ACTION: ActionType = 'loop_cycle'

/** What one brief will cost. A function, not a constant, so it reads the config live. */
export function briefCost(): number {
  return creditCost(BRIEF_ACTION)
}

/** What the orchestration itself costs. */
export function cycleCost(): number {
  return creditCost(CYCLE_ACTION)
}

/** The shape the preview needs from a brief. Narrow, so tests need no full row. */
export interface PricedBrief {
  id: string
  priority: number
  estimated_credits: number
  included: boolean
}

export interface CostPreview {
  /** What the create stage will spend if approved as it stands. */
  creationCredits: number
  /** What the orchestration already cost. Shown so the total is the whole truth. */
  orchestrationCredits: number
  /** Both together — the number a person is really agreeing to for the week. */
  totalCredits: number
  includedCount: number
  excludedCount: number
  /** The weekly budget in force, or null when none is set. */
  budgetCredits: number | null
  /** True when creation alone exceeds what is left of the budget. */
  overBudget: boolean
  /** How far over, or 0. Never negative. */
  overBy: number
}

/**
 * Price a plan exactly as the screen will show it.
 *
 * `orchestrationCredits` is counted in the TOTAL but not in `creationCredits`,
 * because they answer different questions: what is about to be spent (the
 * decision) versus what the week has cost (the record). Folding them into one
 * number would make the approve button appear to charge for something already
 * charged.
 */
export function previewCost(
  briefs: readonly PricedBrief[],
  budgetCredits: number | null,
): CostPreview {
  const included = briefs.filter((b) => b.included)
  const creationCredits = included.reduce((sum, b) => sum + b.estimated_credits, 0)
  const orchestrationCredits = cycleCost()
  const totalCredits = creationCredits + orchestrationCredits

  // Measured against the budget for the WEEK, which the orchestration charge is
  // also part of — a 150-credit budget that has already spent 20 has 130 left.
  const remaining = budgetCredits === null ? null : budgetCredits - orchestrationCredits
  const overBudget = remaining !== null && creationCredits > remaining
  return {
    creationCredits,
    orchestrationCredits,
    totalCredits,
    includedCount: included.length,
    excludedCount: briefs.length - included.length,
    budgetCredits,
    overBudget,
    overBy: overBudget && remaining !== null ? creationCredits - remaining : 0,
  }
}

/**
 * Which briefs to drop so the plan fits the budget — LOWEST PRIORITY FIRST
 * (FSD M2).
 *
 * ── THIS SUGGESTS; IT DOES NOT APPLY ─────────────────────────────────────────
 * It returns the ids to exclude and changes nothing. At L0–L2 the trim is a
 * person's decision, made in the preview, and this only pre-selects a sensible
 * starting point for them. FSD M2 gives the automatic version to L3 — "at L3 the
 * budget cap trims automatically" — and L3 does not ship, so there is no caller
 * that trims without someone looking.
 *
 * Sorting is by descending priority so the LEAST important go first. Ties break
 * on id, so the same plan and the same budget always produce the same
 * suggestion — a trim that reshuffled between two renders would look like the
 * page changing its mind.
 */
export function trimToBudget(
  briefs: readonly PricedBrief[],
  budgetCredits: number | null,
): readonly string[] {
  if (budgetCredits === null) return []
  const remaining = budgetCredits - cycleCost()

  const order = [...briefs]
    .filter((b) => b.included)
    .sort((a, b) => b.priority - a.priority || (a.id < b.id ? -1 : 1))

  const dropped: string[] = []
  let total = order.reduce((sum, b) => sum + b.estimated_credits, 0)
  for (const brief of order) {
    if (total <= remaining) break
    dropped.push(brief.id)
    total -= brief.estimated_credits
  }
  return dropped
}

/** A brief's price at the moment the plan is written. */
export function priceBrief(): number {
  return briefCost()
}

/** Narrow a full row to what the preview needs. */
export function toPricedBrief(brief: LoopBrief): PricedBrief {
  return {
    id: brief.id,
    priority: brief.priority,
    estimated_credits: brief.estimated_credits,
    included: brief.included,
  }
}
