import { z } from 'zod'
import { PLAN_CATALOG, PlanIdSchema, type PlanId } from '@sahoda/shared'
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
} {
  const parsed = CashfreeOrderTagsSchema.parse(tags)
  return { workspaceId: parsed.workspace_id, planId: parsed.plan_id, period: parsed.period }
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
    assertOrderMatchesPlan(order, fields.planId)
  }

  return {
    provider: CASHFREE_ID,
    eventId: `${payload.type}:${String(payment.cf_payment_id)}`,
    eventType,
    workspaceId: fields.workspaceId,
    planId: fields.planId,
    period: fields.period,
    mode: opts.mode ?? 'sandbox',
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
function assertOrderMatchesPlan(order: z.infer<typeof OrderSchema>, planId: PlanId): void {
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

  const expected = PLAN_CATALOG[planId].priceInr
  if (order.order_amount !== expected) {
    throw new Error(
      `cashfree order amount ${order.order_amount} does not match the ${planId} plan amount ${expected}`,
    )
  }
}
