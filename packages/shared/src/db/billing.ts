import { z } from 'zod'
import {
  PlanIdSchema,
  SubscriptionStatusSchema,
  BillingProviderSchema,
  LedgerEntryTypeSchema,
  ModelTierSchema,
  WebhookEventStatusSchema,
} from '../enums'
import { JsonbSchema, NumericSchema } from '../common'

// ── plans (⚙ global, seeded from PRD §7.1) ───────────────────────────────────
export const PlanSchema = z.object({
  id: PlanIdSchema,
  name: z.string(),
  monthly_credits: z.int(),
  price_inr: z.int(),
  price_usd: z.int(),
  limits: JsonbSchema,
  stripe_price_id: z.string().nullable(),
  active: z.boolean(),
  created_at: z.string(),
  updated_at: z.string(),
})
export type Plan = z.infer<typeof PlanSchema>

// ── subscriptions (no row ⇒ Free plan) ────────────────────────────────────────
export const SubscriptionSchema = z.object({
  id: z.uuid(),
  workspace_id: z.uuid(),
  plan_id: PlanIdSchema,
  status: SubscriptionStatusSchema,
  provider: BillingProviderSchema,
  provider_customer_id: z.string().nullable(),
  provider_subscription_id: z.string().nullable(),
  current_period_start: z.string().nullable(),
  current_period_end: z.string().nullable(),
  cancel_at_period_end: z.boolean(),
  created_at: z.string(),
  updated_at: z.string(),
})
export type Subscription = z.infer<typeof SubscriptionSchema>

// ── credit_balances (materialized per-workspace; written only by the ledger fn) ─
export const CreditBalanceSchema = z.object({
  workspace_id: z.uuid(),
  balance_total: z.int(),
  balance_held: z.int(),
  updated_at: z.string(),
})
export type CreditBalance = z.infer<typeof CreditBalanceSchema>

/** Available credits = total − held (what the UI shows, what a HOLD checks). */
export const availableCredits = (
  b: Pick<CreditBalance, 'balance_total' | 'balance_held'>,
): number => b.balance_total - b.balance_held

// ── credit_ledger (append-only; member SELECT includes model_tier + cogs for the transparency UI) ─
export const LedgerEntrySchema = z.object({
  id: z.uuid(),
  workspace_id: z.uuid(),
  seq: z.number(), // int8 identity — monotonic order (created_at can invert under lock contention)
  entry_type: LedgerEntryTypeSchema,
  amount: z.int(),
  balance_after: z.int(),
  action_type: z.string().nullable(),
  object_ref: z.string().nullable(),
  model_tier: ModelTierSchema.nullable(),
  cogs_usd_est: NumericSchema.nullable(),
  idempotency_key: z.string(),
  settles_entry_id: z.uuid().nullable(),
  hold_expires_at: z.string().nullable(),
  actor: z.string().nullable(),
  meta: JsonbSchema.nullable(),
  created_at: z.string(),
})
export type LedgerEntry = z.infer<typeof LedgerEntrySchema>

// ── billing_webhook_events (⚙ service-only; event-id idempotency) ─────────────
export const BillingWebhookEventSchema = z.object({
  id: z.uuid(),
  provider: BillingProviderSchema,
  event_id: z.string(),
  event_type: z.string().nullable(),
  payload: JsonbSchema.nullable(),
  status: WebhookEventStatusSchema,
  error: z.string().nullable(),
  processed_at: z.string().nullable(),
  created_at: z.string(),
})
export type BillingWebhookEvent = z.infer<typeof BillingWebhookEventSchema>
