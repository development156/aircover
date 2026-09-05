import { z } from 'zod'
import {
  inrForCredits,
  PLAN_CATALOG,
  PlanIdSchema,
  refuseTopUpCredits,
  type PlanId,
} from '@sahoda/shared'
import { PeriodSchema } from '../../period'
import type { ParsedWebhookEvent, PaymentEventType, PaymentMode } from '../types'

export const CASHFREE_ID = 'cashfree' as const

/** Cashfree PG bills in INR only for this rail; anything else is a misconfiguration. */
const EXPECTED_CURRENCY = 'INR'

/**
 * The tags we attach at create-order and read back off the webhook. A Cashfree webhook has no
 * notion of our workspace, plan or period — this round-trip is the only carrier.
 *
 * Keys are snake_case to match the tag values written in `createCheckout`; values are strings
 * because Cashfree types order_tags as `map[string]string`.
 */
export const CashfreeOrderTagsSchema = z.object({
  workspace_id: z.string().min(1),
  plan_id: PlanIdSchema,
  period: PeriodSchema,
  /**
   * A mid-period PLAN CHANGE. All three travel together or not at all.
   *
   * These are OUR values, written at create-order and echoed back inside a body whose
   * signature has already been verified — a customer cannot author them any more than they
   * can author `plan_id`. They are still bounded below (`assertOrderMatchesPlan`), because
   * "an attacker cannot set this" and "a bug of ours cannot set this wrongly" are different
   * claims and only the first one is true.
   *
   * Cashfree types order_tags as map[string]string, so the numbers arrive as strings.
   */
  change_id: z.string().min(1).optional(),
  change_credits: z.coerce.number().int().min(0).optional(),
  change_amount_inr: z.coerce.number().min(0).optional(),

  /**
   * A bought PACK OF CREDITS. Same provenance and the same caveat as the three above:
   * ours, echoed back inside a verified body, and still bounded below because our own
   * bug is the threat this guards, not the customer.
   */
  topup_credits: z.coerce.number().int().positive().optional(),
  topup_amount_inr: z.coerce.number().positive().optional(),
})
export type CashfreeOrderTags = z.infer<typeof CashfreeOrderTagsSchema>

const OrderSchema = z.object({
  order_id: z.string().min(1),
  order_amount: z.number().optional(),
  order_currency: z.string().optional(),
  order_tags: z.record(z.string(), z.string()).nullish(),
})

const WebhookSchema = z.object({
  type: z.string().min(1),
  event_time: z.string().optional(),
  data: z.object({
    order: OrderSchema,
    payment: z.object({
      cf_payment_id: z.union([z.string(), z.number()]),
      payment_status: z.string().optional(),
      payment_amount: z.number().optional(),
    }),
  }),
})

/**
 * Raised when a webhook arrives without the order_tags that carry workspace/plan/period.
 *
 * Distinct from a generic parse failure because it is RECOVERABLE: `GET /pg/orders/{order_id}`
 * is documented to return order_tags, so an async resolver can re-derive the event. The echo
 * of tags into the webhook itself is confirmed by Cashfree's own SDK types but by no published
 * example, so this path is built rather than assumed.
 */
export class CashfreeTagsMissingError extends Error {
  readonly orderId: string
  constructor(orderId: string) {
    super(`cashfree webhook for order ${orderId} carried no order_tags`)
    this.name = 'CashfreeTagsMissingError'
    this.orderId = orderId
  }
}

export interface ParseCashfreeWebhookOptions {
  /** Honesty label carried onto every event. Defaults to sandbox. */
  mode?: PaymentMode
}

/** Map Cashfree's webhook `type` onto the normalized event types billing acts on. */
export function normalizeCashfreeEventType(type: string): PaymentEventType {
  if (type === 'PAYMENT_SUCCESS_WEBHOOK') return 'payment_succeeded'
  if (type === 'PAYMENT_FAILED_WEBHOOK' || type === 'PAYMENT_USER_DROPPED_WEBHOOK') {
    return 'payment_failed'
  }
  return 'unknown'
}

/** Validate the order_tags map into the fields a ParsedWebhookEvent needs. */
export function tagsToEventFields(tags: Record<string, string>): {
  workspaceId: string
  planId: PlanId
  period: string
  planChange?: { changeId: string; credits: number; amountInr: number }
  topUp?: { credits: number; amountInr: number }
} {
  const parsed = CashfreeOrderTagsSchema.parse(tags)
  const base = {
    workspaceId: parsed.workspace_id,
    planId: parsed.plan_id,
    period: parsed.period,
  }

  // The three plan-change tags are a unit. A partial set means the order was written by a
  // version of this code that disagrees with this one, and guessing the missing field is how
  // a grant gets the wrong amount — so it is a parse failure, not a fallback to a full month.
  const present = [parsed.change_id, parsed.change_credits, parsed.change_amount_inr].filter(
    (v) => v !== undefined,
  ).length

  // The two top-up tags are a unit for the same reason the three above are, and the two
  // KINDS are mutually exclusive: an order is a month of a plan or a pack of credits, never
  // both. Tagged as both, there is no honest amount to reconcile against and no single
  // idempotency key to write under, so it is a parse failure rather than a guess.
  const topUpPresent = [parsed.topup_credits, parsed.topup_amount_inr].filter(
    (v) => v !== undefined,
  ).length
  if (topUpPresent === 1) {
    throw new Error('cashfree order_tags carry a partial top-up (both tags or neither)')
  }
  if (topUpPresent === 2 && present > 0) {
    throw new Error('cashfree order_tags carry both a plan change and a top-up')
  }

  if (topUpPresent === 2) {
    const credits = parsed.topup_credits as number
    const amountInr = parsed.topup_amount_inr as number

    // The pack must be one this product actually sells, and its price must be the one
    // price. Without this a tag written by a future version of our own code — or an
    // order opened before a rate change — could grant credits nobody paid for.
    const refusal = refuseTopUpCredits(credits)
    if (refusal) {
      throw new Error(`cashfree order_tags carry an unsellable top-up of ${credits} credits`)
    }
    const expected = inrForCredits(credits)
    if (amountInr !== expected) {
      throw new Error(
        `cashfree top-up tag says ${amountInr} for ${credits} credits; the rate says ${expected}`,
      )
    }
    return { ...base, topUp: { credits, amountInr } }
  }

  if (present === 0) return base
  if (present !== 3) {
    throw new Error('cashfree order_tags carry a partial plan change (all three or none)')
  }

  return {
    ...base,
    planChange: {
      changeId: parsed.change_id as string,
      credits: parsed.change_credits as number,
      amountInr: parsed.change_amount_inr as number,
    },
  }
}

/**
 * Parse a VERIFIED Cashfree webhook body into the normalized event.
 *
 * Synchronous and throwing, per the PaymentProvider seam. Callers must have verified the
 * signature over the raw body first.
 */
export function parseCashfreeWebhook(
  rawBody: string,
  opts: ParseCashfreeWebhookOptions = {},
): ParsedWebhookEvent {
  const delivered: unknown = JSON.parse(rawBody)
  const payload = WebhookSchema.parse(delivered)
  const { order, payment } = payload.data

  const tags = order.order_tags
  if (!tags || Object.keys(tags).length === 0) {
    throw new CashfreeTagsMissingError(order.order_id)
  }

  const fields = tagsToEventFields(tags)
  const eventType = normalizeCashfreeEventType(payload.type)

  // Reconcile only what we are about to act on. A failed/dropped payment grants nothing, so
  // holding it to the plan price would reject legitimate failure notifications.
  if (eventType === 'payment_succeeded') {
    assertOrderMatchesPlan(order, fields.planId, fields.planChange, fields.topUp)
  }

  return {
    provider: CASHFREE_ID,
    eventId: `${payload.type}:${String(payment.cf_payment_id)}`,
    eventType,
    workspaceId: fields.workspaceId,
    planId: fields.planId,
    period: fields.period,
    mode: opts.mode ?? 'sandbox',
    ...(fields.planChange
      ? {
          planChange: {
            changeId: fields.planChange.changeId,
            credits: fields.planChange.credits,
          },
        }
      : {}),
    ...(fields.topUp ? { topUp: { orderId: order.order_id, credits: fields.topUp.credits } } : {}),
    // The DELIVERED payload, not the zod-parsed one. WebhookSchema is non-strict, so parsing
    // strips everything billing does not read — bank_reference, payment_time, payment_method,
    // customer_details. Those are exactly the fields needed to reconcile a disputed charge from
    // the billing_webhook_events audit row, so the row must keep the body Cashfree actually sent.
    raw: delivered,
  }
}

/**
 * Defence in depth behind the signature: credits granted come from `plan_id`, so an order
 * whose amount disagrees with the tagged plan must not mint that plan's grant.
 *
 * Compares `order_amount` — the amount WE set — not `payment_amount`, which legitimately comes
 * in lower when an offer applies (the official example shows order 2 / payment 1).
 */
function assertOrderMatchesPlan(
  order: z.infer<typeof OrderSchema>,
  planId: PlanId,
  planChange?: { changeId: string; credits: number; amountInr: number },
  topUp?: { credits: number; amountInr: number },
): void {
  const currency = order.order_currency ?? EXPECTED_CURRENCY
  if (currency !== EXPECTED_CURRENCY) {
    throw new Error(`cashfree order currency ${currency} is not ${EXPECTED_CURRENCY}`)
  }

  // Fail CLOSED on omission. A check that is skipped whenever the field is absent is not
  // defence in depth — it is a check an attacker (or a schema change) can turn off by leaving
  // the field out. A success webhook we act on must state its amount.
  if (order.order_amount === undefined) {
    throw new Error(`cashfree success webhook for order ${order.order_id} carried no order_amount`)
  }

  // A mid-period upgrade is charged a PRORATED amount, so the catalogue price is the wrong
  // thing to reconcile against. The tagged amount is used instead — and then bounded, because
  // the tags and the amount both come from us and a bug in our own proration must not be able
  // to mint a month's credits for a rupee.
  /**
   * A bought pack is reconciled against THE RATE, not against a plan.
   *
   * `tagsToEventFields` has already checked that the tagged rupees are what the rate says
   * for the tagged credits. This is the second half of the same guarantee and the one that
   * matters: that the money Cashfree actually took is that same figure. Without it a tag
   * pair consistent with itself but inconsistent with the order would grant credits for an
   * order of any size.
   */
  if (topUp) {
    const expectedInr = inrForCredits(topUp.credits)
    if (order.order_amount !== expectedInr) {
      throw new Error(
        `cashfree order amount ${order.order_amount} does not match ${expectedInr} for ${topUp.credits} credits`,
      )
    }
    return
  }

  if (planChange) {
    if (order.order_amount !== planChange.amountInr) {
      throw new Error(
        `cashfree order amount ${order.order_amount} does not match the tagged plan-change amount ${planChange.amountInr}`,
      )
    }
    // A proration can never exceed a full month of the plan being moved to.
    const ceiling = PLAN_CATALOG[planId].monthlyCredits
    if (planChange.credits > ceiling) {
      throw new Error(
        `cashfree plan change would grant ${planChange.credits} credits, above the ${planId} monthly allotment of ${ceiling}`,
      )
    }
    return
  }

  const expected = PLAN_CATALOG[planId].priceInr
  if (order.order_amount !== expected) {
    throw new Error(
      `cashfree order amount ${order.order_amount} does not match the ${planId} plan amount ${expected}`,
    )
  }
}
