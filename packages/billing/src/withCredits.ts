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

export interface WithCreditsDeps {
  /** Injected for deterministic traceIds in tests; defaults to a random UUID. */
  newTraceId?: () => string
  holdTtlSeconds?: number
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
        return err(appError('PROVIDER_ERROR', messageOf(runErr), traceId))
      }

      // DEBIT: settle the hold for the exact cost. model_tier / cogs stay null for now
      // (owner ruling #3 — enriched via the mesh seam later). If this settle throws — a
      // transient DB error, or the hold was already settled by the TTL reaper / a racing
      // RELEASE — it flows to the outer backstop as a PROVIDER_ERROR Result: the user is
      // NOT charged (the hold releases), and a retry replays debitKey(hKey) idempotently.
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
      return err(appError('PROVIDER_ERROR', messageOf(unexpected), traceId))
    }
  }

  return withCredits
}

/**
 * Next hold attempt: resume an unsettled hold (crash recovery replays the same key),
 * otherwise advance past the last settled attempt so a retry after a prior run gets a
 * fresh hold instead of colliding with an already-settled one.
 */
function nextAttempt(latest: LatestHold | null): number {
  if (!latest) return 1
  return latest.settled ? latest.attempt + 1 : latest.attempt
}

function isCreditInsufficient(e: unknown): boolean {
  return messageOf(e).includes('CREDIT_INSUFFICIENT')
}

function messageOf(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}
