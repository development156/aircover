/**
 * Return shapes for the credit actions. Outside the `'use server'` module,
 * which may export only async functions.
 */

export type CreditCreateState =
  { ok: true; requestId: string; approverEmail: string } | { ok: false; message: string }

export type CreditVerifyState =
  /**
   * `amount` is `null` when the RPC returned without one. NOT 0: the action used
   * to coalesce a missing amount to zero and the toast read "Granted 0 credits"
   * over a grant that had just landed — a figure nothing measured, on the one
   * screen in the product that moves money by hand.
   */
  | { ok: true; amount: number | null; balanceAfter: number | null; replayed: boolean }
  | { ok: false; message: string }

export interface WorkspaceHit {
  id: string
  name: string
  slug: string
  available: number
}

/** Said when we genuinely do not know more. Never a raw database message. */
export const CREDIT_FAILED = 'That did not go through. No credits were moved.'
