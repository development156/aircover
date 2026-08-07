/**
 * Return shapes for the credit actions. Outside the `'use server'` module,
 * which may export only async functions.
 */

export type CreditCreateState =
  { ok: true; requestId: string; approverEmail: string } | { ok: false; message: string }

export type CreditVerifyState =
  | { ok: true; amount: number; balanceAfter: number | null; replayed: boolean }
  | { ok: false; message: string }

export interface WorkspaceHit {
  id: string
  name: string
  slug: string
  available: number
}

/** Said when we genuinely do not know more. Never a raw database message. */
export const CREDIT_FAILED = 'That did not go through. No credits were moved.'
