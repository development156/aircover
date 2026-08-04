import type { Result } from '../errors'
import type { ActionType } from '../ledger/pricing'

/**
 * Contract for the credit wrapper implemented in packages/billing. The full flow
 * (FSD 0.1 / §3.4): entitlement gate → derive attempt → HOLD → run fn → DEBIT on
 * success / RELEASE on failure. Attempt is derived server-side inside the wrapper,
 * never supplied by the caller.
 */
export interface WithCreditsOpts {
  workspaceId: string
  action: ActionType
  objectRef: string
}

/** Passed to the wrapped fn so it can record actionType + creditsCharged on the ai_provider_logs row. */
export interface CreditChargeContext {
  actionType: ActionType
  creditsCharged: number
}

/** Result + updated balance in the response (FSD 0.1). */
export type WithCreditsResult<T> = Result<{ data: T; balanceAfter: number }>

export type WithCreditsFn = <T>(
  opts: WithCreditsOpts,
  fn: (ctx: CreditChargeContext) => Promise<T>,
) => Promise<WithCreditsResult<T>>
