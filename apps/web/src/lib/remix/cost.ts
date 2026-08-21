import { creditCost, MESH_TASK_ACTION, type ActionType, type RemixKind } from '@sahoda/shared'

import { REMIX_KINDS, type RemixKindSpec } from './catalogue'

/**
 * WHAT A REMIX BATCH COSTS, BEFORE ANY OF IT IS SPENT.
 *
 * ── ONE FUNCTION, TWO CALLERS ────────────────────────────────────────────────
 * The preview on screen and the runner that spends the credits both call
 * `previewBatch`. That is the whole point of the module: two sources of truth
 * for money disagree the first time a price moves, and they disagree in the
 * worst possible way — with the screen showing one figure and the ledger
 * charging another. `lib/loop/cost.ts` says the same about the Loop and this is
 * the same rule, not a second one.
 *
 * ── EVERY NUMBER IS A LOOKUP OR A SUM OF LOOKUPS ─────────────────────────────
 * `creditCost()` reads pricing.config.json, which is the only place a credit
 * price exists in this product. There is not a numeric literal in the arithmetic
 * below, and `cost.test.ts` asserts the RELATIONSHIPS rather than any figure.
 *
 * ── A KIND IS ONE CALL, SO A KIND IS ONE CHARGE ──────────────────────────────
 * None of the frozen mesh tasks takes a channel: `content_variants` answers for
 * a whole list in one call, and `caption_rewrite`'s input has no channel field.
 * So four channels of "a short version" is ONE `shorten` call, and pricing it
 * per channel would quote four times the real figure — the trap `lib/loop/cost.ts`
 * names in its own words: "a preview that overstates is still a wrong preview,
 * and it would push people to trim work they could afford".
 *
 * The consequence has to reach the screen: TRIMMING A CHANNEL CHANGES WHAT YOU
 * GET AND NOT WHAT YOU PAY; trimming a whole kind is what moves the number.
 * `CostLine` carries both figures so the screen can say it rather than imply it.
 *
 * ── WHY THE BATCH FEE IS CHARGED AT RUN AND NOT AT PLAN ──────────────────────
 * The Loop charges `loop_cycle` at PREVIEW time, and that is right there because
 * the plan stage makes a real model call — its own comment says "the plan
 * stage's model call is what it pays for". Planning a Remix batch makes no model
 * call at all: it is arithmetic over the catalogue. Charging for it would bill
 * for nothing AND break the promise that the total is shown before anything is
 * spent. So planning spends exactly zero and `remix_pack` is charged once by the
 * runner.
 *
 * ── IF THE OWNER WANTS THE OLD FLAT PACK PRICE BACK ──────────────────────────
 * The roadmap screen said "one price for the whole batch — 15 credits", which is
 * `remix_pack` alone with the per-kind charges folded into it. That is a pricing
 * decision rather than a code one, and reversing it is one line: drop
 * `derivativeCredits` from `totalCredits` and return `[]` from the per-kind loop
 * in `plannedCharges`. It is one line because the money lives in one function.
 */

/** The batch fee. FSD M3.3 prices Remix as a pack; this is that price's key. */
export const BATCH_ACTION: ActionType = 'remix_pack'

/** The ledger/pricing key a kind charges under. */
export function actionForKind(kind: RemixKind): ActionType {
  return MESH_TASK_ACTION[specFor(kind).meshTask]
}

function specFor(kind: RemixKind): RemixKindSpec {
  const spec = REMIX_KINDS.find((k) => k.kind === kind)
  // Not a defensive `?? default`. A kind with no spec is a programming error,
  // and a fallback price would charge somebody for it.
  if (!spec) throw new Error(`no Remix kind named "${kind}"`)
  return spec
}

/** The shape the preview needs. Narrow, so a test needs no database row. */
export interface PricedDerivative {
  readonly id: string
  readonly kind: RemixKind
  readonly included: boolean
}

export interface CostLine {
  readonly kind: RemixKind
  readonly label: string
  /** How many DRAFTS this line produces. A count of rows, not a multiplier. */
  readonly drafts: number
  readonly action: ActionType
  /** What this line costs: one call, one price, however many drafts. */
  readonly credits: number
}

export interface BatchCost {
  readonly lines: readonly CostLine[]
  /** Everything the writing costs together — one price per included kind. */
  readonly derivativeCredits: number
  /** The batch fee — `remix_pack`, charged once, at run time. */
  readonly batchCredits: number
  /** The number a person is agreeing to. Both of the above. */
  readonly totalCredits: number
  /** How many drafts the batch will produce. */
  readonly includedCount: number
  readonly excludedCount: number
}

/** The kinds with at least one draft left in them, in catalogue order. */
function includedKinds(derivatives: readonly PricedDerivative[]): RemixKindSpec[] {
  const kept = derivatives.filter((d) => d.included)
  return REMIX_KINDS.filter((spec) => kept.some((d) => d.kind === spec.kind))
}

/**
 * Price a batch exactly as the screen will show it and exactly as the runner
 * will charge it.
 *
 * A batch with nothing included costs the batch fee and nothing else — which is
 * what the runner would do, so the preview says it. The screen refuses to start
 * an empty batch for that reason, and nobody ever pays the fee for no drafts.
 */
export function previewBatch(derivatives: readonly PricedDerivative[]): BatchCost {
  const kept = derivatives.filter((d) => d.included)

  const lines: CostLine[] = includedKinds(derivatives).map((spec) => {
    const action = MESH_TASK_ACTION[spec.meshTask]
    return {
      kind: spec.kind,
      label: spec.label,
      drafts: kept.filter((d) => d.kind === spec.kind).length,
      action,
      // ONE call covers every channel. See the header.
      credits: creditCost(action),
    }
  })

  const derivativeCredits = lines.reduce((sum, line) => sum + line.credits, 0)
  const batchCredits = creditCost(BATCH_ACTION)

  return {
    lines,
    derivativeCredits,
    batchCredits,
    totalCredits: derivativeCredits + batchCredits,
    includedCount: kept.length,
    excludedCount: derivatives.length - kept.length,
  }
}

/**
 * The charges the runner will make, in order — one entry per `withCredits` call.
 *
 * DERIVED FROM THE SAME KINDS the preview renders, so the two cannot disagree
 * about how many charges there are or what each one is for.
 *
 * The batch fee is FIRST. If the wallet runs dry mid-batch, the person has paid
 * for the run they got and the kinds that did not happen are the ones that were
 * not charged.
 */
export interface PlannedCharge {
  readonly action: ActionType
  /** Which drafts this one charge covers. Empty for the batch fee. */
  readonly derivativeIds: readonly string[]
  readonly kind: RemixKind | null
}

export function plannedCharges(derivatives: readonly PricedDerivative[]): PlannedCharge[] {
  const kept = derivatives.filter((d) => d.included)
  const charges: PlannedCharge[] = [{ action: BATCH_ACTION, derivativeIds: [], kind: null }]

  for (const spec of includedKinds(derivatives)) {
    charges.push({
      action: MESH_TASK_ACTION[spec.meshTask],
      derivativeIds: kept.filter((d) => d.kind === spec.kind).map((d) => d.id),
      kind: spec.kind,
    })
  }
  return charges
}

/**
 * The total of a charge list, which MUST equal the preview's total.
 *
 * Written as its own function rather than inlined so the property can be
 * asserted directly: `cost.test.ts` runs both over every combination of kinds
 * and requires them equal. A preview that quotes one number while the runner
 * makes charges summing to another is the defect this exists to make impossible.
 */
export function chargeTotal(charges: readonly PlannedCharge[]): number {
  return charges.reduce((sum, charge) => sum + creditCost(charge.action), 0)
}
