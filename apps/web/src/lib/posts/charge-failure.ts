import { creditCost, type ActionType, type CreditInsufficientDetails } from '@sahoda/shared'

import type { GenerateState } from './state'

/**
 * Map a `withCredits` failure to user-facing copy for the AI post actions.
 *
 * The hard part is the charge claim. `withCredits` (packages/billing/src/withCredits.ts)
 * only reaches its DEBIT once the wrapped callback has RETURNED. If that DEBIT
 * COMMITS in Postgres and then the ack is lost — connection reset, pool error,
 * timeout after commit — the throw escapes to the outer backstop at :119-121 and
 * comes back as a plain `PROVIDER_ERROR`. The user WAS charged. Nothing in the
 * error distinguishes that from a DEBIT that never committed.
 *
 * So the split is: did the callback deliver?
 *  - callback THREW  → `withCredits` RELEASED the hold before returning (:84-99).
 *                      "You were not charged" is true, and retrying is free.
 *  - callback RETURNED → the failure happened at or after the DEBIT. We cannot
 *                      confirm the charge either way, so we say exactly that and
 *                      do not invite a blind retry (a retry with a fresh objectRef
 *                      is a second charge).
 */

/**
 * The only failure reasons this module will ever put in front of a user. They are
 * our own copy, authored here — never provider or mesh text. `chargeFailureState`
 * re-checks the value against this set at runtime, so a caller that accidentally
 * forwards `result.error.message` gets the generic line instead of leaking it.
 */
export const FAILURE_REASON = {
  MESH_ERROR: 'The model could not complete this.',
  NO_VARIANTS: 'The model returned no usable variants.',
  EMPTY_REWRITE: 'The model returned an empty rewrite.',
  NO_PLAN: 'The model returned no usable plan.',
  SAVE_FAILED: 'The plan could not be saved.',
  NO_SITE: 'The model returned no usable site.',
  SITE_SAVE_FAILED: 'The site could not be saved.',
} as const

export type FailureReason = (typeof FAILURE_REASON)[keyof typeof FAILURE_REASON]

const VETTED_REASONS: readonly FailureReason[] = Object.values(FAILURE_REASON)

function isVettedReason(reason: string): reason is FailureReason {
  return VETTED_REASONS.some((vetted) => vetted === reason)
}

/** Said only when the callback never delivered — the RELEASE ran, so this is verifiable. */
const NOT_CHARGED = 'You were not charged. Try again.'

/** Said when the callback delivered but the wrapper still failed. Deliberately claims nothing. */
const UNCONFIRMED =
  'The model ran, but we could not confirm whether it was charged. Check your wallet balance before you run this again.'

/** Same claim as NOT_CHARGED, written as one sentence — it has no reason to follow. */
const GENERIC = 'Could not complete this action. You were not charged. Try again.'

export interface ChargeFailureInput {
  /**
   * The typed error `withCredits` returned. `message` is deliberately absent from
   * this shape: it can carry provider text, so the mapping must not be able to
   * read it at all.
   */
  error: { code: string; details?: unknown }
  action: ActionType
  /**
   * True when the wrapped callback reached its `return`. Tracked by the caller —
   * the error alone cannot tell us, and it decides whether a charge claim is
   * honest.
   */
  delivered: boolean
  /** The reason the callback stashed before throwing. Ignored unless it is vetted copy. */
  reason: string | null
}

/**
 * The failure arms of the post action states. `GenerateState` and `RewriteState`
 * share them exactly, so both actions return this — no shape is redefined here.
 */
export type ChargeFailureState = Extract<GenerateState, { ok: false }>

export function chargeFailureState(input: ChargeFailureInput): ChargeFailureState {
  const { error, action, delivered, reason } = input

  // An insufficient balance is the one expected rejection: it is raised by the
  // HOLD, before the callback ever runs, so nothing was spent. Show the exact
  // shortfall and route to top-up.
  if (error.code === 'CREDIT_INSUFFICIENT') {
    const details = isCreditInsufficientDetails(error.details) ? error.details : null
    return {
      ok: false,
      insufficient: true,
      required: details?.required ?? creditCost(action),
      available: details?.available ?? 0,
    }
  }

  // Delivered: the run succeeded and the wrapper failed at or after the DEBIT.
  // Claiming "not charged" here would be a lie on the lost-ack path.
  if (delivered) {
    return { ok: false, insufficient: false, message: UNCONFIRMED }
  }

  // Not delivered: the hold was RELEASED. "Not charged" is true, and the reason
  // the callback stashed is ours to show — if it is one we actually wrote.
  if (reason !== null && isVettedReason(reason)) {
    return { ok: false, insufficient: false, message: `${reason} ${NOT_CHARGED}` }
  }
  return { ok: false, insufficient: false, message: GENERIC }
}

function isCreditInsufficientDetails(value: unknown): value is CreditInsufficientDetails {
  return (
    typeof value === 'object' &&
    value !== null &&
    'available' in value &&
    'required' in value &&
    typeof value.available === 'number' &&
    typeof value.required === 'number'
  )
}
