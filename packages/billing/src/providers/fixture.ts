import { createHmac, timingSafeEqual } from 'node:crypto'
import { z } from 'zod'
import { PlanIdSchema } from '@sahoda/shared'
import type {
  CheckoutSession,
  CreateCheckoutInput,
  ParsedWebhookEvent,
  PaymentEventType,
  PaymentProvider,
} from './types'

const FIXTURE_ID = 'fixture'
const DEFAULT_SECRET = 'fixture-webhook-secret'

/** Wire shape of a fixture webhook body — validated at the boundary before billing acts on it. */
const FixturePayloadSchema = z.object({
  id: z.string().min(1),
  type: z.string().min(1),
  data: z.object({
    workspace_id: z.string().min(1),
    plan_id: PlanIdSchema,
    period: z.string().min(1),
  }),
})
type FixturePayload = z.infer<typeof FixturePayloadSchema>

export interface FixtureProviderOptions {
  /** Secret used to sign + verify fixture webhooks (defaults to a fixed test secret). */
  webhookSecret?: string
}

export interface EmitPaidEventInput {
  workspaceId: string
  planId: FixturePayload['data']['plan_id']
  period: string
  eventId: string
}

/** The fixture provider plus test/demo-only helpers to mint signed webhook bodies. */
export type FixtureProvider = PaymentProvider & {
  /** HMAC-sign a raw body exactly as a real provider webhook would be signed. */
  sign(rawBody: string): string
  /** Build a signed "customer paid" webhook (the demo/test simulator for an inbound event). */
  emitPaidEvent(input: EmitPaidEventInput): { rawBody: string; signature: string }
}

/**
 * A payment provider double: real HMAC signing/verification and a normalized parse, but
 * every output is labelled mode:'fixture' so nothing is ever presented as a real charge.
 * Lets the checkout → webhook → grant path be exercised end-to-end before Cashfree lands.
 */
export function createFixtureProvider(opts: FixtureProviderOptions = {}): FixtureProvider {
  const secret = opts.webhookSecret ?? DEFAULT_SECRET

  const sign = (rawBody: string): string =>
    createHmac('sha256', secret).update(rawBody).digest('hex')

  const verifyWebhookSignature = (rawBody: string, signature: string): boolean => {
    const expected = Buffer.from(sign(rawBody))
    const given = Buffer.from(signature)
    // Length guard first — timingSafeEqual throws on unequal lengths.
    return expected.length === given.length && timingSafeEqual(expected, given)
  }

  return {
    id: FIXTURE_ID,
    mode: 'fixture',

    async createCheckout(input: CreateCheckoutInput): Promise<CheckoutSession> {
      const params = new URLSearchParams({
        ws: input.workspaceId,
        plan: input.planId,
        period: input.period,
      })
      return {
        id: `fixture_cs_${input.workspaceId}_${input.period}`,
        url: `https://fixture.local/checkout?${params.toString()}`,
        mode: 'fixture',
      }
    },

    verifyWebhookSignature,

    parseWebhookEvent(rawBody: string): ParsedWebhookEvent {
      const payload: FixturePayload = FixturePayloadSchema.parse(JSON.parse(rawBody))
      return {
        provider: FIXTURE_ID,
        eventId: payload.id,
        eventType: normalizeEventType(payload.type),
        workspaceId: payload.data.workspace_id,
        planId: payload.data.plan_id,
        period: payload.data.period,
        mode: 'fixture',
        raw: payload,
      }
    },

    sign,

    emitPaidEvent(input: EmitPaidEventInput): { rawBody: string; signature: string } {
      const payload: FixturePayload = {
        id: input.eventId,
        type: 'payment.succeeded',
        data: { workspace_id: input.workspaceId, plan_id: input.planId, period: input.period },
      }
      const rawBody = JSON.stringify(payload)
      return { rawBody, signature: sign(rawBody) }
    },
  }
}

function normalizeEventType(type: string): PaymentEventType {
  if (type === 'payment.succeeded') return 'payment_succeeded'
  if (type === 'payment.failed') return 'payment_failed'
  return 'unknown'
}
