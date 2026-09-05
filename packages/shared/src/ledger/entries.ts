import { z } from 'zod'
import { LedgerEntryTypeSchema, ModelTierSchema } from '../enums'

/**
 * Input to `app.apply_ledger_entry()` (the only ledger write path). `holdTtlSeconds`
 * is converted to a Postgres interval by the RPC wrapper; used on HOLD entries.
 */
export const ApplyLedgerInputSchema = z.object({
  workspaceId: z.uuid(),
  entryType: LedgerEntryTypeSchema,
  amount: z.int(),
  idempotencyKey: z.string().min(1),
  actionType: z.string().optional(),
  objectRef: z.string().optional(),
  modelTier: ModelTierSchema.optional(),
  cogsUsdEst: z.number().optional(),
  settlesEntryId: z.uuid().optional(),
  holdTtlSeconds: z.number().int().positive().optional(),
  actor: z.string().optional(),
  meta: z.record(z.string(), z.unknown()).optional(),
})
export type ApplyLedgerInput = z.infer<typeof ApplyLedgerInputSchema>

// Idempotency-key builders — the HOLD key and its two settlement keys are derived
// deterministically so retries of any step replay rather than double-apply.
export const holdKey = (action: string, objectId: string, attempt: number): string =>
  `${action}:${objectId}:${attempt}`
export const debitKey = (hold: string): string => `${hold}:debit`
export const releaseKey = (hold: string): string => `${hold}:release`
export const expiredReleaseKey = (hold: string): string => `${hold}:expired_release`

// Grant keys for the two Alpha grant events (idempotent).
export const signupGrantKey = (workspaceId: string): string => `grant:signup:${workspaceId}`
export const monthlyGrantKey = (plan: string, period: string, workspaceId: string): string =>
  `grant:${plan}:${period}:${workspaceId}`

/**
 * A bought pack of credits, keyed on the PAYMENT and nothing else.
 *
 * Not (workspace, amount) and not (workspace, period): a customer may buy the same
 * size twice in one minute, and both purchases must land. `monthlyGrantKey`'s own
 * comment records why keying too broadly is a money bug — here it would be the
 * opposite defect, taking a second payment and granting nothing for it.
 *
 * The provider's order id is unique per order and survives a redelivery of the same
 * webhook, which is exactly the pair of properties this needs.
 */
export const topUpGrantKey = (orderId: string): string => `topup:${orderId}`

/**
 * Where a GRANT came from, carried on `action_type`.
 *
 * This exists because the value was previously a bare literal in TWO places with
 * nothing connecting them: `bootstrap_workspace` writes `'signup_grant'` in SQL,
 * and the wallet's copy classifier keyed an object off `'signup_grant'` in
 * TypeScript. Either could have been renamed on its own — the producer would keep
 * writing rows and the classifier would silently fall through to "Included with
 * your plan", telling a brand-new user that credits they were given free came
 * with a plan they have not bought.
 *
 * CAVEAT, and it is the real defect: `credit_ledger.action_type` is `text` with no
 * enum and no CHECK. These constants are a convention that producer and consumer
 * agree to, not something the database enforces. Replacing the convention with a
 * real `grant_origin` column (or structured `meta`) is tracked as SL-032.
 */
export const GRANT_ORIGIN = {
  /** bootstrap_workspace's free signup grant. */
  signup: 'signup_grant',
  /** An ops admin's maker-checker grant (doc 13 §6). */
  admin: 'admin_grant',
} as const
export type GrantOrigin = (typeof GRANT_ORIGIN)[keyof typeof GRANT_ORIGIN]

export const GrantOriginSchema = z.enum([GRANT_ORIGIN.signup, GRANT_ORIGIN.admin])

/**
 * Idempotency key for an admin credit grant (doc 13 §6).
 *
 * Keyed on the credit REQUEST id, not on the workspace or the amount, which is
 * what makes a retry a replay: `apply_ledger_entry` returns the existing entry
 * with `replayed: true` and the balance does not move. One approved request can
 * only ever grant once, however many times the verify call is repeated.
 */
export const adminGrantKey = (requestId: string): string => `${GRANT_ORIGIN.admin}:${requestId}`
