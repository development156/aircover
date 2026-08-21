import { randomUUID } from 'node:crypto'
import {
  appError,
  chargebackKey,
  err,
  ok,
  refundKey,
  type ReversalOutcome,
  type Result,
} from '@sahoda/shared'
import type { LedgerPort } from '../ledger/port'

/**
 * Reversing money: a chargeback from the customer's bank, or a refund issued by support.
 *
 * ── A COMPENSATING ENTRY, NEVER AN EDIT ──────────────────────────────────────
 * The ledger is append-only and enforced as such by a trigger — `app.block_mutations`
 * refuses UPDATE and DELETE on `credit_ledger` even to `service_role`. So a reversal is a
 * NEW row: an `ADJUST` with a negative amount, which is the one entry type whose CHECK
 * constraint permits one. Nothing here rewrites history, and nothing here needs to.
 *
 * ── WHAT MEASUREMENT CHANGED ABOUT THIS DESIGN ───────────────────────────────
 * The obvious implementation — "ADJUST by minus the full amount" — is wrong, and it fails
 * in the worst available way. Run against the real function under PGlite:
 *
 *     GRANT 1500, DEBIT 1300            → balance_total = 200
 *     ADJUST -1500                      → ERROR: new row for relation "credit_balances"
 *                                          violates check constraint "balance_held_le_total"
 *     balance afterwards                → 200, unchanged
 *     ledger rows afterwards            → 2 — the chargeback wrote NOTHING
 *
 * The transaction aborts atomically, so a chargeback against a spent balance leaves no
 * trace at all. The money is gone from the bank account and the ledger does not know. That
 * is strictly worse than an imperfect record.
 *
 * ── SO THE REVERSAL IS CLAMPED, AND THE REMAINDER IS REPORTED ────────────────
 * The most that can be taken back is AVAILABLE credits (`total - held`): `balance_total`
 * may not go negative, and `balance_held` may not exceed it, so held credits bound the
 * reversal just as firmly as the total does. Anything beyond that has already been
 * consumed, and consumed credits cannot be un-consumed.
 *
 * The remainder is `shortfallCredits`, and it is deliberately NOT forced into the ledger:
 *
 *   · The schema forbids it, and the schema is right — a negative credit balance would be
 *     a debt denominated in the wrong unit.
 *   · Credits are a delivered good. What is outstanding after a chargeback is MONEY, and
 *     money owed belongs on the credit note as a receivable, where a person can act on it.
 *
 * `reversedCredits + shortfallCredits === requestedCredits` always holds, and the contract
 * enforces it with a refinement so a caller cannot report one without the other.
 *
 * ── WHY THE CLAMP IS RETRIED ─────────────────────────────────────────────────
 * Reading the balance and then applying the ADJUST is check-then-act: a concurrent DEBIT
 * between the two makes even the clamped amount too large, and the whole transaction
 * aborts again. The retry re-reads and re-clamps. It is safe to retry because the failed
 * attempt wrote nothing — and safe to retry with a DIFFERENT amount under the SAME
 * idempotency key, because the key identifies the dispute, not the figure.
 */

/** How many times to re-clamp against a balance that is moving underneath us. */
const MAX_CLAMP_ATTEMPTS = 4

/** Fixed user-facing copy. A ledger failure must never leak a constraint name to a caller. */
const GENERIC_FAILURE = 'Could not record the reversal'

/**
 * Postgres check constraints on `credit_balances` that a too-large reversal trips.
 *
 * Matched by NAME rather than by SQLSTATE: 23514 is every check constraint in the schema,
 * and treating an unrelated one as "the balance moved" would retry a genuine bug three
 * times and then report it as a shortfall. Both names are matched because which one fires
 * depends on whether the workspace is holding credits — MEASURED: with `held = 0` it is
 * `balance_held_le_total`, not the `balance_total_nonneg` you would expect.
 */
const BALANCE_FLOOR_CONSTRAINTS = ['balance_held_le_total', 'balance_total_nonneg']

function isBalanceFloorViolation(cause: unknown): boolean {
  const message = cause instanceof Error ? cause.message : String(cause)
  return BALANCE_FLOOR_CONSTRAINTS.some((name) => message.includes(name))
}

export type ReversalKind = 'chargeback' | 'refund'

export interface ApplyReversalInput {
  workspaceId: string
  kind: ReversalKind
  /** The dispute id (chargeback) or refund id. Keys the entry, so a retry replays. */
  reference: string
  /** Credits the original payment granted, which this reversal is trying to take back. */
  credits: number
  /** Recorded on the entry. e.g. `provider:cashfree` or `admin:<user id>`. */
  actor: string
  /** Free-form audit context stored on the entry. Never anything secret. */
  meta?: Record<string, unknown>
}

export interface ApplyReversalDeps {
  ledger: LedgerPort
  newTraceId?: () => string
  onError?: (cause: unknown, traceId: string) => void
}

export type ApplyReversalFn = (input: ApplyReversalInput) => Promise<Result<ReversalOutcome>>

export function createApplyReversal(deps: ApplyReversalDeps): ApplyReversalFn {
  const { ledger } = deps
  const newTraceId = deps.newTraceId ?? (() => randomUUID())

  const notify = (cause: unknown, traceId: string): void => {
    try {
      deps.onError?.(cause, traceId)
    } catch {
      // a broken logger must not turn a typed error into a rejection
    }
  }

  return async function applyReversal(input: ApplyReversalInput): Promise<Result<ReversalOutcome>> {
    const traceId = newTraceId()

    if (!Number.isInteger(input.credits) || input.credits < 0) {
      return err(
        appError(
          'VALIDATION_ERROR',
          `credits must be a non-negative integer (got ${input.credits})`,
          traceId,
        ),
      )
    }

    const key =
      input.kind === 'chargeback' ? chargebackKey(input.reference) : refundKey(input.reference)

    // A zero-credit reversal is a real event (a dispute over a payment that granted nothing)
    // and must not become a ledger entry: apply_ledger_entry rejects a zero ADJUST outright.
    if (input.credits === 0) {
      return ok({
        reference: input.reference,
        requestedCredits: 0,
        reversedCredits: 0,
        shortfallCredits: 0,
        entryId: null,
        replayed: false,
        attempts: 1,
      })
    }

    let lastCause: unknown = null

    for (let attempt = 1; attempt <= MAX_CLAMP_ATTEMPTS; attempt += 1) {
      let available: number
      try {
        const balance = await ledger.balance(input.workspaceId)
        available = Math.max(0, balance.total - balance.held)
      } catch (cause) {
        notify(cause, traceId)
        return err(appError('PROVIDER_ERROR', GENERIC_FAILURE, traceId))
      }

      const reversible = Math.min(input.credits, available)

      // Nothing left to take back. The whole amount is a receivable, and the caller records
      // it on the credit note. Reported as a success because the reversal WAS processed —
      // an error here would make a real, correctly-handled dispute look like an outage.
      if (reversible === 0) {
        return ok({
          reference: input.reference,
          requestedCredits: input.credits,
          reversedCredits: 0,
          shortfallCredits: input.credits,
          entryId: null,
          replayed: false,
          attempts: attempt,
        })
      }

      try {
        const res = await ledger.apply({
          workspaceId: input.workspaceId,
          entryType: 'ADJUST',
          amount: -reversible,
          idempotencyKey: key,
          actionType: input.kind,
          objectRef: input.reference,
          actor: input.actor,
          meta: {
            ...(input.meta ?? {}),
            kind: input.kind,
            reference: input.reference,
            requestedCredits: input.credits,
            reversedCredits: reversible,
            shortfallCredits: input.credits - reversible,
          },
        })

        return ok({
          reference: input.reference,
          requestedCredits: input.credits,
          reversedCredits: reversible,
          shortfallCredits: input.credits - reversible,
          entryId: res.entry.id,
          replayed: res.replayed,
          attempts: attempt,
        })
      } catch (cause) {
        lastCause = cause
        // The balance moved under us between the read and the write. Re-clamp and try again;
        // the failed attempt wrote nothing, so the key is still free.
        if (isBalanceFloorViolation(cause)) continue
        notify(cause, traceId)
        return err(appError('PROVIDER_ERROR', GENERIC_FAILURE, traceId))
      }
    }

    // Every attempt lost the race. Surfacing this rather than reporting a zero reversal:
    // "we could not record it" and "there was nothing to take back" are different facts,
    // and only one of them means somebody has to look.
    notify(lastCause, traceId)
    return err(
      appError('PROVIDER_ERROR', GENERIC_FAILURE, traceId, {
        attempts: MAX_CLAMP_ATTEMPTS,
        reference: input.reference,
      }),
    )
  }
}
