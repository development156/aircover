import { randomUUID } from 'node:crypto'
import {
  appError,
  creditCost,
  debitKey,
  err,
  holdKey,
  ok,
  releaseKey,
  type CreditInsufficientDetails,
  type WithCreditsFn,
} from '@sahoda/shared'
import type { LatestHold, LedgerPort } from './ledger/port'

/** HOLD time-to-live. If a run dies between HOLD and settle, the ledger auto-releases (sahoda-ledger). */
const DEFAULT_HOLD_TTL_SECONDS = 600

/** User-facing failure copy. Fixed strings only — see `notifyError`. */
const GENERIC_FAILURE = 'Could not complete the action'

export interface WithCreditsDeps {
  /** Injected for deterministic traceIds in tests; defaults to a random UUID. */
  newTraceId?: () => string
  holdTtlSeconds?: number
  /**
   * Server-side observability hook. The raw cause is handed here and NEVER placed on the
   * returned Result, so an operator keeps the detail while the customer sees fixed copy.
   * Correlate via `traceId`. Default is a no-op — no logger dependency, no console.
   */
  onError?: (cause: unknown, traceId: string) => void
}

/**
 * The credit wrapper (FSD §3.4): derive attempt → HOLD → run fn → DEBIT on success
 * / RELEASE on failure. Users are never charged for failures. Charge amount comes
 * ONLY from `creditCost(action)` — never a literal (CLAUDE.md non-negotiable).
 *
 * Entitlement gating is a SEPARATE gate helper called at each AI entry point BEFORE
 * this wrapper (owner ruling #5) — it deliberately does not live here.
 */
export function createWithCredits(port: LedgerPort, deps: WithCreditsDeps = {}): WithCreditsFn {
  const newTraceId = deps.newTraceId ?? (() => randomUUID())
  const holdTtlSeconds = deps.holdTtlSeconds ?? DEFAULT_HOLD_TTL_SECONDS

  /** Report to the operator without ever letting a logger failure corrupt the result path. */
  const notifyError = (cause: unknown, traceId: string): void => {
    try {
      deps.onError?.(cause, traceId)
    } catch {
      // a broken logger must not turn a typed error into a rejection
    }
  }

  const withCredits: WithCreditsFn = async (opts, fn) => {
    const traceId = newTraceId()

    // Backstop: WithCreditsFn is typed Promise<Result<…>> — callers branch on `.ok` and
    // never expect a rejection. Any UNGUARDED throw inside (the latestHold read, the DEBIT
    // settle, an invalid action) becomes a typed Result here, never a rejected promise
    // (mirrors mesh's run() "typed error on every path" guarantee).
    try {
      const { workspaceId, action, objectRef } = opts
      const cost = creditCost(action)

      // Attempt is derived server-side from ledger state — the caller never supplies it.
      const latest = await port.latestHold({ workspaceId, action, objectRef })
      const attempt = nextAttempt(latest)
      const hKey = holdKey(action, objectRef, attempt)

      // HOLD: reserve credits before the model call. An insufficient balance is the
      // one expected rejection — everything else is an infrastructure failure.
      let holdId: string
      try {
        const hold = await port.apply({
          workspaceId,
          entryType: 'HOLD',
          amount: cost,
          idempotencyKey: hKey,
          actionType: action,
          objectRef,
          holdTtlSeconds,
        })
        holdId = hold.entry.id
      } catch (holdErr) {
        if (isCreditInsufficient(holdErr)) {
          const bal = await port.balance(workspaceId)
          const details: CreditInsufficientDetails = {
            available: bal.total - bal.held,
            required: cost,
          }
          return err(
            appError('CREDIT_INSUFFICIENT', `Not enough credits for ${action}`, traceId, details),
          )
        }
        return err(appError('PROVIDER_ERROR', 'Could not reserve credits', traceId))
      }

      // RUN the wrapped action.
      let data: Awaited<ReturnType<typeof fn>>
      try {
        data = await fn({ actionType: action, creditsCharged: cost })
      } catch (runErr) {
        // RELEASE: the user is not charged for a failed action. If the RELEASE write
        // itself fails, the HOLD's TTL is the backstop — still return an honest error.
        try {
          await port.apply({
            workspaceId,
            entryType: 'RELEASE',
            amount: cost,
            idempotencyKey: releaseKey(hKey),
            settlesEntryId: holdId,
          })
        } catch {
          // swallowed: hold expires via TTL; the caller-facing error below is unchanged
        }
        // Fixed copy: the caller's own throw is frequently a control-flow sentinel
        // (e.g. 'MESH_ERROR') and apps/web renders this message to the customer verbatim.
        notifyError(runErr, traceId)
        return err(appError('PROVIDER_ERROR', GENERIC_FAILURE, traceId))
      }

      // DEBIT: settle the hold for the exact cost. model_tier / cogs stay null for now
      // (owner ruling #3 — enriched via the mesh seam later). If this settle throws it flows
      // to the outer backstop as PROVIDER_ERROR. Two retry cases, both exactly-once:
      //  - the DEBIT never committed → the hold is still open → the retry resumes the same
      //    attempt and DEBITs (first real charge);
      //  - the DEBIT committed but the ack was lost → the hold is settled-by-DEBIT → the retry
      //    REUSES the attempt (see nextAttempt) so this same debitKey REPLAYS — charged once.
      const debit = await port.apply({
        workspaceId,
        entryType: 'DEBIT',
        amount: cost,
        idempotencyKey: debitKey(hKey),
        actionType: action,
        objectRef,
        settlesEntryId: holdId,
      })

      return ok({ data, balanceAfter: debit.entry.balanceAfter })
    } catch (unexpected) {
      notifyError(unexpected, traceId)
      return err(appError('PROVIDER_ERROR', GENERIC_FAILURE, traceId))
    }
  }

  return withCredits
}

/**
 * Next hold attempt. Advance ONLY when the last hold was RELEASED (the prior attempt was
 * refunded, so a fresh hold is safe and correct). In every other case REUSE the attempt:
 *  - unsettled     → resume (crash recovery replays the same key);
 *  - settled-by-DEBIT → the operation already charged; reusing the attempt makes the retry's
 *    DEBIT REPLAY idempotently instead of charging a second time (a committed-but-lost-ack
 *    DEBIT surfaced as PROVIDER_ERROR must not double-charge on retry). Exactly-once charge
 *    per (action, objectRef) — to charge again, the caller passes a fresh objectRef.
 */
function nextAttempt(latest: LatestHold | null): number {
  if (!latest) return 1
  return latest.settledBy === 'release' ? latest.attempt + 1 : latest.attempt
}

function isCreditInsufficient(e: unknown): boolean {
  return messageOf(e).includes('CREDIT_INSUFFICIENT')
}

function messageOf(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}
