import { z } from 'zod'
import {
  PlanIdSchema,
  SubscriptionStatusSchema,
  BillingProviderSchema,
  LedgerEntryTypeSchema,
  ModelTierSchema,
  WebhookEventStatusSchema,
} from '../enums'
import { JsonbSchema, NumericSchema, type Numeric } from '../common'

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

// ── billing_profiles (who the invoice is made out to) ─────────────────────────
/**
 * The three tax identities are three DIFFERENT outcomes, and the table's CHECK constraints
 * make the contradictory combinations unrepresentable — "registered with no GSTIN" cannot
 * be stored, and neither can a registered customer whose state disagrees with the first
 * two characters of their own GSTIN. Mirrored here rather than restated: `TaxIdentity` in
 * `billing/gst` is the shape the tax calculation consumes, and `toTaxIdentity` below is the
 * only sanctioned way to get from this row to that.
 */
export const BillingProfileSchema = z.object({
  workspace_id: z.uuid(),
  tax_kind: z.enum(['registered', 'unregistered', 'overseas']),
  legal_name: z.string(),
  gstin: z.string().nullable(),
  state_code: z.string().nullable(),
  country_code: z.string().nullable(),
  address: z.string().nullable(),
  billing_email: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
})
export type BillingProfile = z.infer<typeof BillingProfileSchema>

// ── invoices (append-only statutory documents; written only by app.issue_invoice) ──
/**
 * A tax invoice or a credit note. APPEND-ONLY, enforced by the same cascade-aware trigger
 * the credit ledger uses: under GST an invoice cannot be amended, and a correction is a
 * credit note that REFERENCES it. That is the ledger's compensating-entry discipline
 * applied to the statutory record, arrived at from the other direction.
 *
 * Money is in PAISE and every field is an integer. The table also carries the arithmetic
 * as a CHECK (`taxable + cgst + sgst + igst = gross`), so a document whose lines do not add
 * up to what the card was charged does not exist.
 */
export const InvoiceSchema = z.object({
  id: z.uuid(),
  workspace_id: z.uuid(),
  document_type: z.enum(['tax_invoice', 'credit_note']),
  /** The printed number, e.g. 'SL/26-27/000123'. Consecutive within a financial year. */
  serial: z.string(),
  financial_year: z.string(),
  serial_seq: z.int(),
  issued_at: z.string(),
  period: z.string().nullable(),
  plan_id: PlanIdSchema.nullable(),
  sac_code: z.string(),
  /** SNAPSHOT of the supplier at issue time — never joined to today's configuration. */
  supplier_legal_name: z.string(),
  supplier_gstin: z.string(),
  supplier_state_code: z.string(),
  recipient_legal_name: z.string(),
  recipient_gstin: z.string().nullable(),
  recipient_state_code: z.string().nullable(),
  recipient_country_code: z.string().nullable(),
  place_of_supply: z.string(),
  treatment: z.enum(['intra_state', 'inter_state', 'zero_rated_export']),
  rate_percent: z.int(),
  currency: z.string(),
  gross_paise: NumericSchema,
  taxable_paise: NumericSchema,
  cgst_paise: NumericSchema,
  sgst_paise: NumericSchema,
  igst_paise: NumericSchema,
  zero_rated: z.boolean(),
  under_lut: z.boolean(),
  references_invoice_id: z.uuid().nullable(),
  reason: z.enum(['refund', 'chargeback']).nullable(),
  /** Credits a reversal could not take back. A receivable in money, not a negative balance. */
  shortfall_credits: z.int(),
  provider: BillingProviderSchema.nullable(),
  provider_order_id: z.string().nullable(),
  provider_payment_id: z.string().nullable(),
  ledger_entry_id: z.uuid().nullable(),
  meta: JsonbSchema.nullable(),
  created_at: z.string(),
})
export type Invoice = z.infer<typeof InvoiceSchema>

/**
 * An integer number of paise from a `bigint` column.
 *
 * `pg` returns bigint as a STRING rather than a number — it refuses to silently lose
 * precision past 2^53, and it is right to. Every money figure on an invoice therefore
 * arrives as `"49900"`, and `"49900" / 100` happens to work in JavaScript while
 * `"49900" + 100` produces `"49900100"`. One of those is a money bug that renders.
 *
 * This is the only sanctioned way to read one. It THROWS on anything that is not a whole
 * number, because the alternative — returning NaN or 0 — puts a wrong figure on a
 * statutory document rather than stopping.
 */
export function invoicePaise(value: Numeric): number {
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isInteger(n)) {
    throw new Error(`invoicePaise: not a whole number of paise (${JSON.stringify(value)})`)
  }
  return n
}

/** Rupees for display, from a paise column. Formatting only — never an input to arithmetic. */
export function invoiceRupees(value: Numeric): number {
  return invoicePaise(value) / 100
}

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
