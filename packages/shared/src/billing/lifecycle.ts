import { z } from 'zod'
import { PlanIdSchema, SubscriptionStatusSchema } from '../enums'

/**
 * The plan lifecycle vocabulary: changing plan, failing to pay, and being over a limit.
 *
 * Shapes only. Every calculation over them lives in `@sahoda/billing` — this file is the
 * contract apps/web and apps/jobs both read, so neither can invent its own idea of what
 * "past due" means.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Changing plan
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The two directions, and they behave differently ON PURPOSE.
 *
 * `upgrade` takes effect NOW: the customer pays the difference for the unused part of the
 * period and receives the matching part of the credit difference immediately.
 *
 * `downgrade` takes effect at the END of the period, always. It is never immediate and it
 * never refunds. That is not a courtesy — it is forced by the ledger. Credits already
 * granted may already be SPENT, so a mid-period downgrade would have to claw back credits
 * that are no longer there, and `apply_ledger_entry` cannot take a balance below zero
 * (MEASURED: the whole transaction aborts on `balance_held_le_total`, writing nothing at
 * all). Deferring the change is the only design under which the ledger stays honest.
 */
export const PlanChangeKindSchema = z.enum(['upgrade', 'downgrade', 'same'])
export type PlanChangeKind = z.infer<typeof PlanChangeKindSchema>

/**
 * What a plan change will cost and grant, computed BEFORE anything is charged.
 *
 * Every field is derivable from the plan catalog and the clock. Nothing here may be
 * displayed as a fact about the customer's account that a query could not reproduce.
 */
export const ProrationSchema = z.object({
  kind: PlanChangeKindSchema,
  fromPlanId: PlanIdSchema,
  toPlanId: PlanIdSchema,
  /** When the change takes effect. For a downgrade this is the end of the current period. */
  effectiveAt: z.iso.datetime(),
  /** True when the customer gets the new plan immediately rather than at period end. */
  immediate: z.boolean(),
  /**
   * Fraction of the billing period still unused, in BASIS POINTS (0..10000).
   *
   * An integer, because this number is multiplied into money. A float fraction reintroduces
   * exactly the rounding error `computeTax` refuses to carry.
   */
  unusedBasisPoints: z.int().min(0).max(10_000),
  /** What the new plan costs for the remaining part of the period. */
  remainderChargePaise: z.int().min(0),
  /**
   * What the customer has already paid for and will not use, at the OLD rate, set against
   * the charge. Zero when the current period was never paid for — a workspace in dunning
   * has no unused value to offset, and crediting it one would hand out the difference.
   */
  unusedCreditPaise: z.int().min(0),
  /** The charge, after the unused portion is set against it. Never negative — see below. */
  amountDuePaise: z.int().min(0),
  /**
   * Credits granted on the change. Never negative: a plan change may not remove credits
   * the customer already holds, so a "downgrade" of the credit line grants zero rather
   * than debiting. See the ledger note on PlanChangeKindSchema.
   */
  creditsGranted: z.int().min(0),
})
export type Proration = z.infer<typeof ProrationSchema>

// ─────────────────────────────────────────────────────────────────────────────
// Failing to pay
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Where a workspace sits in the dunning sequence.
 *
 * These map onto `subscriptions.status`, which already carries
 * `past_due` / `grace` / `suspended` / `canceled` — the schema anticipated this and nothing
 * new is invented here. `current` is the absence of dunning, not a fifth status.
 */
export const DunningStageSchema = z.enum(['current', 'past_due', 'grace', 'suspended', 'canceled'])
export type DunningStage = z.infer<typeof DunningStageSchema>

/**
 * What a workspace in dunning is allowed to do.
 *
 * The rule that runs through all of it: **credits already granted are the customer's
 * property.** They were paid for. Nothing in dunning removes them, and a suspended
 * workspace can still spend the balance it holds. What lapses is the ENTITLEMENT — the
 * channel and site allowances a plan buys — because those are a subscription, not a good.
 */
export const DunningPolicySchema = z.object({
  stage: DunningStageSchema,
  /** Plan whose limits apply right now. Falls back to 'free' once suspended. */
  effectivePlanId: PlanIdSchema,
  /** Whether the next monthly grant runs. Stops the moment a period goes unpaid. */
  monthlyGrantRuns: z.boolean(),
  /** Whether the balance the customer already holds can still be spent. Always true. */
  existingCreditsSpendable: z.literal(true),
  /** When the current stage ends and the next one begins, if anything is scheduled. */
  stageEndsAt: z.iso.datetime().nullable(),
  /** Retry attempts already made against the failed payment. */
  attemptsMade: z.int().min(0),
  /** When the next automatic retry is due, or null when retries are exhausted. */
  nextRetryAt: z.iso.datetime().nullable(),
})
export type DunningPolicy = z.infer<typeof DunningPolicySchema>

// ─────────────────────────────────────────────────────────────────────────────
// Being over a limit
// ─────────────────────────────────────────────────────────────────────────────

/**
 * One dimension on which a workspace exceeds the plan it is about to be on.
 *
 * `have` is a COUNTED value from the database, never an estimate: this drives a sentence
 * telling a customer how many of their own things they have, which is the one class of
 * number this product may not invent.
 */
export const OverLimitDimensionSchema = z.object({
  dimension: z.enum(['channels', 'sites', 'seats']),
  have: z.int().min(0),
  allowed: z.int().min(0),
})
export type OverLimitDimension = z.infer<typeof OverLimitDimensionSchema>

/**
 * What happens to a workspace that is over the limit of the plan it is moving to.
 *
 * `nothingIsDeleted` is a literal `true` and not a boolean, so the guarantee is in the
 * TYPE. A future change that decides to start deleting a customer's channels on a billing
 * event cannot do it by flipping a flag — it has to change this contract, in a diff
 * somebody has to read.
 */
export const DowngradeImpactSchema = z.object({
  toPlanId: PlanIdSchema,
  effectiveAt: z.iso.datetime(),
  over: z.array(OverLimitDimensionSchema),
  /** Sahoda never removes a customer's work because their plan changed. */
  nothingIsDeleted: z.literal(true),
  /** Creating MORE of an over-limit resource is refused until they are back under it. */
  blocksNewCreates: z.boolean(),
})
export type DowngradeImpact = z.infer<typeof DowngradeImpactSchema>

/** The subscription as the app reads it. A workspace with no row is Free and `current`. */
export const SubscriptionViewSchema = z.object({
  workspaceId: z.uuid(),
  planId: PlanIdSchema,
  status: SubscriptionStatusSchema,
  currentPeriodStart: z.iso.datetime().nullable(),
  currentPeriodEnd: z.iso.datetime().nullable(),
  cancelAtPeriodEnd: z.boolean(),
  /** A downgrade already scheduled for period end, or null. */
  pendingPlanId: PlanIdSchema.nullable(),
  pendingPlanEffectiveAt: z.iso.datetime().nullable(),
  graceEndsAt: z.iso.datetime().nullable(),
  dunningAttempts: z.int().min(0),
  lastFailureAt: z.iso.datetime().nullable(),
  lastFailureCode: z.string().nullable(),
})
export type SubscriptionView = z.infer<typeof SubscriptionViewSchema>

// ─────────────────────────────────────────────────────────────────────────────
// Money coming back out
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The result of reversing money: a chargeback raised by the customer's bank, or a refund
 * issued by support. Both are the same shape because both are the same event to the
 * ledger — a COMPENSATING ENTRY, never an edit.
 *
 * ── THE FIELD THAT MATTERS IS `shortfallCredits` ─────────────────────────────
 * A chargeback can be larger than the balance that remains, because the customer may have
 * already spent the credits the money bought. MEASURED against the real
 * `app.apply_ledger_entry` under PGlite: a compensating entry that would take the balance
 * below zero does not clamp itself — it violates `balance_held_le_total`, the whole
 * transaction aborts, and NO ledger row is written. The chargeback becomes invisible.
 *
 * So the reversal is clamped to what is actually there, and the remainder is reported here
 * rather than forced into the ledger. That is not a rounding-off: credits are a delivered
 * good, and credits that were consumed cannot be un-consumed. What is outstanding is
 * MONEY, and money owed belongs on the credit note as a receivable — not as a negative
 * credit balance, which the schema forbids and which would misdescribe the debt anyway.
 *
 * `reversedCredits + shortfallCredits === requestedCredits`, always.
 */
export const ReversalOutcomeSchema = z
  .object({
    /** The dispute or refund this reverses. Also the ledger idempotency key's payload. */
    reference: z.string().min(1),
    /** Credits the original payment granted, and which this reversal is trying to take back. */
    requestedCredits: z.int().min(0),
    /** Credits the ledger actually took back. */
    reversedCredits: z.int().min(0),
    /** Credits already consumed. Outstanding as MONEY, on the credit note — never as a balance. */
    shortfallCredits: z.int().min(0),
    /** The compensating ledger entry, or null when there was nothing left to reverse. */
    entryId: z.string().nullable(),
    /** True when this reversal had already been applied and the ledger replayed it. */
    replayed: z.boolean(),
    /** How many times the clamp had to be recomputed against a moving balance. */
    attempts: z.int().min(1),
  })
  .refine((r) => r.reversedCredits + r.shortfallCredits === r.requestedCredits, {
    message: 'reversed + shortfall must equal requested',
  })
export type ReversalOutcome = z.infer<typeof ReversalOutcomeSchema>

/**
 * Idempotency key for the credit grant that accompanies a plan change.
 *
 * Deliberately NOT `monthlyGrantKey`. That key is (plan, period, workspace) with no amount
 * and no change id in it, so an upgrade to Growth in a month where Growth had already been
 * granted would REPLAY — returning `replayed: true` and granting nothing, while real money
 * had just been taken. Keying on the plan-change id makes each change its own event.
 */
export const planChangeGrantKey = (planChangeId: string): string => `planchange:${planChangeId}`

/**
 * Idempotency key for the compensating entry that reverses a chargeback.
 *
 * Keyed on the DISPUTE, not the amount: a retry after a lost acknowledgement must replay
 * the original entry rather than reverse the same money twice.
 */
export const chargebackKey = (disputeId: string): string => `chargeback:${disputeId}`

/** Idempotency key for a refund issued by support. Keyed on the refund, for the same reason. */
export const refundKey = (refundId: string): string => `refund:${refundId}`
