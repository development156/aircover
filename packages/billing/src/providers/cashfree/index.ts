import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { PLAN_CATALOG } from '@sahoda/shared'
import { fetchTransport, type Transport } from '../../transport'
import { parsePeriod } from '../../period'
import type {
  CheckoutSession,
  CreateCheckoutInput,
  ParsedWebhookEvent,
  PaymentMode,
  PaymentProvider,
  ProviderOrder,
  WebhookVerifyMeta,
} from '../types'
import { CASHFREE_API_VERSION, modeForEnv, type CashfreeEnv } from './env'
import { verifyCashfreeSignature } from './signature'
import {
  CASHFREE_ID,
  CashfreeTagsMissingError,
  parseCashfreeWebhook,
  tagsToEventFields,
} from './webhook'

/** Create Order response — only the fields billing acts on. */
const CreateOrderResponseSchema = z.object({
  order_id: z.string().min(1),
  payment_session_id: z.string().min(1),
  cf_order_id: z.union([z.string(), z.number()]).optional(),
  order_status: z.string().optional(),
})

/** Get Order response — the order_tags fallback and the checkout bridge both read it. */
const GetOrderResponseSchema = z.object({
  order_id: z.string().min(1),
  order_status: z.string().optional(),
  order_tags: z.record(z.string(), z.string()).nullish(),
  payment_session_id: z.string().min(1).nullish(),
})

/** Cashfree's documented error envelope. */
const ErrorResponseSchema = z.object({
  message: z.string().optional(),
  code: z.string().optional(),
  type: z.string().optional(),
})

export interface CashfreeProviderOptions {
  env: CashfreeEnv
  /**
   * Base URL of the app that hosts the checkout bridge page. Cashfree publishes no documented
   * hosted-checkout URL — Create Order returns a `payment_session_id` for the `cashfree-js`
   * browser SDK — so `CheckoutSession.url` points at an app-owned route that hands the session
   * to that SDK. (The `POST /pg/view/sessions/checkout` pattern circulating online appears in
   * no official documentation and is not used here.)
   */
  appBaseUrl: string
  /** Injected for fixture replay in tests; defaults to global fetch. */
  transport?: Transport
  /** Injected for deterministic order ids / idempotency keys in tests. */
  newId?: () => string
  now?: () => Date
  /** Webhook timestamp tolerance; see verifyCashfreeSignature. */
  signatureToleranceMs?: number
}

/** The provider plus the Cashfree-specific escape hatches the seam cannot express. */
export type CashfreeProvider = PaymentProvider & {
  /**
   * `GET /orders/{id}` — reconciliation, the source of the order_tags fallback, and what the
   * bridge page reads to hand `payment_session_id` to the browser SDK.
   */
  fetchOrder(orderId: string): Promise<ProviderOrder>
  /**
   * Parse a verified webhook, falling back to `GET /orders/{id}` when the delivery carried no
   * order_tags. Async, so it cannot live on the synchronous seam.
   */
  resolveWebhookEvent(rawBody: string): Promise<ParsedWebhookEvent>
}

/**
 * The Cashfree Payments (India) rail, pinned to API version 2025-01-01.
 *
 * One-time orders: createCheckout opens an order tagged with workspace/plan/period, the
 * customer pays, and the PAYMENT_SUCCESS_WEBHOOK drives
 * billing_webhook_events -> applyPlanGrant -> ledger GRANT.
 */
export function createCashfreeProvider(opts: CashfreeProviderOptions): CashfreeProvider {
  const { env, appBaseUrl } = opts
  const transport = opts.transport ?? fetchTransport()
  const newId = opts.newId ?? (() => randomUUID())
  const now = opts.now ?? (() => new Date())
  const mode: PaymentMode = modeForEnv(env.env)

  /** Auth + version headers. The secret is passed here and NEVER retained on an error. */
  const headers = (): Record<string, string> => ({
    'x-api-version': CASHFREE_API_VERSION,
    'x-client-id': env.appId,
    'x-client-secret': env.secretKey,
    'content-type': 'application/json',
  })

  async function createCheckout(input: CreateCheckoutInput): Promise<CheckoutSession> {
    // Validate before spending a network call — and before an ill-formed period becomes an
    // order tag that later keys a grant.
    const period = parsePeriod(input.period)
    const plan = PLAN_CATALOG[input.planId]
    if (!plan) throw new Error(`unknown planId ${JSON.stringify(input.planId)}`)

    const orderId = `sah_${newId()}`

    // A mid-period upgrade charges the PRORATED amount, not the catalogue price. Computed by
    // `computeProration` before we get here; converted to rupees because that is the unit
    // Cashfree's `order_amount` is in, and rounded to two decimals so the figure sent, the
    // figure tagged and the figure the webhook reconciles are byte-identical.
    const amountInr = input.planChange
      ? Math.round(input.planChange.amountPaise) / 100
      : plan.priceInr

    const res = await transport({
      method: 'POST',
      url: `${env.baseUrl}/orders`,
      headers: {
        ...headers(),
        // Lets a retry after a lost ack REPLAY the original response instead of colliding
        // with the 409 a duplicate order_id would raise — the same failure mode withCredits
        // already handles on the ledger side.
        'x-idempotency-key': orderId,
      },
      body: JSON.stringify({
        order_id: orderId,
        order_amount: amountInr,
        order_currency: 'INR',
        customer_details: {
          customer_id: input.workspaceId,
          ...(input.customerEmail ? { customer_email: input.customerEmail } : {}),
        },
        order_meta: {
          return_url: input.successUrl,
        },
        // The ONLY carrier of workspace/plan/period into the webhook. Cashfree types
        // order_tags as map[string]string, so every value is stringified here and coerced
        // back on the way in.
        order_tags: {
          workspace_id: input.workspaceId,
          plan_id: input.planId,
          period,
          ...(input.planChange
            ? {
                change_id: input.planChange.changeId,
                change_credits: String(input.planChange.credits),
                change_amount_inr: String(amountInr),
              }
            : {}),
        },
      }),
    })

    if (res.status < 200 || res.status >= 300) {
      throw cashfreeHttpError('create order', res.status, res.body)
    }

    const body = CreateOrderResponseSchema.parse(JSON.parse(res.body))

    return {
      id: body.order_id,
      sessionId: body.payment_session_id,
      url: `${trimSlash(appBaseUrl)}/billing/checkout/${encodeURIComponent(body.order_id)}`,
      mode,
    }
  }

  async function fetchOrder(orderId: string): Promise<ProviderOrder> {
    const res = await transport({
      method: 'GET',
      url: `${env.baseUrl}/orders/${encodeURIComponent(orderId)}`,
      headers: headers(),
    })

    if (res.status < 200 || res.status >= 300) {
      throw cashfreeHttpError('get order', res.status, res.body)
    }

    const body = GetOrderResponseSchema.parse(JSON.parse(res.body))
    return {
      orderId: body.order_id,
      status: body.order_status ?? null,
      tags: body.order_tags ?? null,
      paymentSessionId: body.payment_session_id ?? null,
    }
  }

  async function resolveWebhookEvent(rawBody: string): Promise<ParsedWebhookEvent> {
    try {
      return parseCashfreeWebhook(rawBody, { mode })
    } catch (e) {
      // Only the tags-missing case is recoverable; everything else is a genuine parse failure
      // and must not be papered over with a network call.
      if (!(e instanceof CashfreeTagsMissingError)) throw e

      const order = await fetchOrder(e.orderId)
      if (!order.tags || Object.keys(order.tags).length === 0) {
        throw new Error(`cashfree order ${e.orderId} has no order_tags to resolve from`)
      }

      // Re-derive from the authoritative order, then re-parse the body with the tags injected
      // so every other invariant (amount, currency, event type) is still enforced.
      const fields = tagsToEventFields(order.tags)
      const withTags = injectOrderTags(rawBody, {
        workspace_id: fields.workspaceId,
        plan_id: fields.planId,
        period: fields.period,
      })
      const event = parseCashfreeWebhook(withTags, { mode })

      // `raw` becomes the billing_webhook_events audit payload, so it must record what Cashfree
      // ACTUALLY sent — not our tag-injected reconstruction. Keep the delivered body verbatim
      // and annotate the out-of-band resolution under a namespaced key instead.
      return {
        ...event,
        raw: {
          ...(JSON.parse(rawBody) as object),
          _sahoda: { orderTagsResolvedVia: `GET /orders/${e.orderId}`, resolvedTags: order.tags },
        },
      }
    }
  }

  return {
    id: CASHFREE_ID,
    mode,

    createCheckout,

    verifyWebhookSignature(rawBody: string, signature: string, meta?: WebhookVerifyMeta): boolean {
      return verifyCashfreeSignature({
        rawBody,
        signature,
        timestamp: meta?.timestamp,
        secretKey: env.secretKey,
        now: now(),
        toleranceMs: opts.signatureToleranceMs,
      })
    },

    parseWebhookEvent(rawBody: string): ParsedWebhookEvent {
      return parseCashfreeWebhook(rawBody, { mode })
    },

    fetchOrder,
    resolveWebhookEvent,
  }
}

/**
 * Classify a Cashfree HTTP failure. The retained detail is Cashfree's own message, truncated —
 * NEVER the request, which carries `x-client-secret` in its headers.
 */
export function cashfreeHttpError(op: string, status: number, body: string): Error {
  const parsed = safeJson(body)
  const envelope = parsed ? ErrorResponseSchema.safeParse(parsed) : null
  const code = envelope?.success ? (envelope.data.code ?? '') : ''
  const message = envelope?.success ? (envelope.data.message ?? '') : ''
  const detail = (message || body).slice(0, 300)

  const err = new Error(`cashfree ${op} failed (${status}${code ? ` ${code}` : ''}): ${detail}`)
  Object.assign(err, { status, code, transient: isTransient(status) })
  return err
}

/** 408/429/5xx are worth retrying; everything else is a permanent, actionable failure. */
export function isTransient(status: number): boolean {
  return status === 408 || status === 429 || status >= 500
}

function safeJson(body: string): unknown {
  try {
    return JSON.parse(body)
  } catch {
    return null
  }
}

function trimSlash(url: string): string {
  return url.endsWith('/') ? url.slice(0, -1) : url
}

/** Re-attach resolved tags to a raw body so the full parse path still runs over it. */
function injectOrderTags(rawBody: string, tags: Record<string, string>): string {
  const payload = JSON.parse(rawBody) as { data?: { order?: Record<string, unknown> } }
  if (payload.data?.order) payload.data.order.order_tags = tags
  return JSON.stringify(payload)
}
