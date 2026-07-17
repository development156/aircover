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
