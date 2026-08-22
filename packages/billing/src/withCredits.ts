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

/**
 * HOLD time-to-live. If a run dies between HOLD and settle, the hold is released by the
 * expired-hold sweep — `holdSweepTask` in apps/jobs, which runs every 5 minutes and releases
 * through `app.apply_ledger_entry()` with an `expiredReleaseKey`, so a repeat sweep is an
 * idempotent replay rather than a double-release.
 *
 * The sweep waits a grace margin past expiry (`holdSweepGraceSeconds`, default 600s) before
 * reaping, so a slow-but-alive run is not released mid-flight — its later DEBIT would raise
 * HOLD_ALREADY_SETTLED and show the user a failure for work that succeeded. Net: stranded
 * credits come back on the order of tens of minutes, not instantly.
 */
const DEFAULT_HOLD_TTL_SECONDS = 600

/** User-facing failure copy. Fixed strings only — see `notifyError`. */
const GENERIC_FAILURE = 'Could not complete the action'

/**
 * What an external-cost resolver is told about the action that just succeeded. Everything
 * here is already known to the wrapper — the resolver is a lookup, never a second source of
 * truth about what happened.
 */
export interface ExternalCostContext {
  workspaceId: string
  action: string
  /** The same objectRef the HOLD was keyed on — e.g. the post id for a publish. */
  objectRef: string
  /** Credits the customer is being charged. Unrelated to the USD figure being resolved. */
  creditsCharged: number
}

/**
 * Resolve what this action cost US in real money (USD), for `credit_ledger.cogs_usd_est`.
 *
 * ── THE SEAM, AND WHY IT IS EMPTY ────────────────────────────────────────────
 * Launch Plan §5 Slice 3 wants per-post external cost threaded through the ledger; the
 * aggregator audit §3.6 recommends the opposite — price publishing at 0 credits and absorb
 * a flat subscription as overhead. Those cannot both be built, and which is right depends on
 * how Zernio actually bills, which is a founder call and not a code decision.
 *
 * So this is the CONSUMER side only, and it is deliberately inert. `cogs_usd_est` is already
 * a parameter of `app.apply_ledger_entry` and already optional on `ApplyLedgerInputSchema`,
 * so no schema, no migration and no `packages/shared` change is involved: the contract
 * existed, nothing was ever passing a value. When a producer can name a per-post figure, it
 * fills this in and the DEBIT starts carrying it. Until then every DEBIT writes null exactly
 * as before.
 *
 * ── TWO PROPERTIES THAT ARE NOT NEGOTIABLE ───────────────────────────────────
 * 1. It cannot fail the charge. A throw, a rejection, or a nonsense number is swallowed and
 *    the DEBIT proceeds with no cogs. This is an accounting annotation on money that has
 *    already moved; letting a reporting lookup turn a completed action into a failure would
 *    mean the customer's work is lost to make a spreadsheet tidier.
 * 2. It is read once, on the settling DEBIT. A retry after a committed-but-lost-ack DEBIT
 *    REPLAYS the same idempotency key, and a replay returns the original row — so a value
 *    resolved on the retry never lands. Treat the first settle as authoritative.
 */
export type ExternalCostResolver = (
  ctx: ExternalCostContext,
) => number | undefined | Promise<number | undefined>

export interface WithCreditsDeps {
  /** Injected for deterministic traceIds in tests; defaults to a random UUID. */
  newTraceId?: () => string
  holdTtlSeconds?: number
  /**
   * Optional per-action external cost in USD, written to `cogs_usd_est` on the DEBIT.
   * Unset today — see `ExternalCostResolver` for what a producer has to supply first.
   */
  externalCostUsd?: ExternalCostResolver
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
        // RELEASE: the user is not charged for a failed action. If the RELEASE write itself
        // fails, the expired-hold sweep in apps/jobs is the backstop — still return an honest
        // error.
        try {
          await port.apply({
            workspaceId,
            entryType: 'RELEASE',
            amount: cost,
            idempotencyKey: releaseKey(hKey),
            settlesEntryId: holdId,
          })
        } catch {
          // swallowed: the expired-hold sweep releases it; caller-facing error below unchanged
        }
        // Fixed copy: the caller's own throw is frequently a control-flow sentinel
        // (e.g. 'MESH_ERROR') and apps/web renders this message to the customer verbatim.
        notifyError(runErr, traceId)
        return err(appError('PROVIDER_ERROR', GENERIC_FAILURE, traceId))
      }

      // What this action cost us in real money, if anyone can say. Resolved AFTER the run
      // (a per-post figure is not knowable before the work happens) and BEFORE the settle,
      // so it rides the same statement as the charge rather than needing a second write.
      // Never allowed to fail the settle — see ExternalCostResolver.
      const cogsUsdEst = await resolveExternalCost(deps.externalCostUsd, notifyError, traceId, {
        workspaceId,
        action,
        objectRef,
        creditsCharged: cost,
      })

      // DEBIT: settle the hold for the exact cost. model_tier stays null for now
      // (owner ruling #3 — enriched via the mesh seam later). If this settle throws it flows
      // to the outer backstop as PROVIDER_ERROR. Two retry cases, both exactly-once:
      //  - the DEBIT never committed → the hold is still open → the retry resumes the same
      //    attempt and DEBITs (first real charge);
      //  - the DEBIT committed but the ack was lost → the hold is settled-by-DEBIT → the retry
      //    REUSES the attempt (see nextAttempt) so this same debitKey REPLAYS — charged once.
      let debit
      try {
        debit = await port.apply({
          workspaceId,
          entryType: 'DEBIT',
          amount: cost,
          idempotencyKey: debitKey(hKey),
          actionType: action,
          objectRef,
          settlesEntryId: holdId,
          cogsUsdEst,
        })
      } catch (settleErr) {
        /**
         * A HOLD WHOSE DEBIT THROWS MUST STILL BE RELEASED.
         *
         * ── WHAT THIS COST BEFORE ────────────────────────────────────────────
         * This threw straight to the outer backstop, which returns
         * PROVIDER_ERROR and releases nothing. The RUN path has had a RELEASE
         * since the beginning; the SETTLE path did not. So a customer whose
         * action completed and whose settle failed had the credits taken out of
         * their spendable balance and left in `held` — and with
         * `SAHODA_HOLD_SWEEP_MODE` unset (default `off`) nothing reclaims them.
         * The wallet then correctly tells them their money is stuck. That is the
         * "users never pay for failures" non-negotiable, failing quietly.
         *
         * ── WHY THIS CANNOT DOUBLE-REFUND, WHICH IS THE ONLY REAL OBJECTION ───
         * The dangerous case is a DEBIT that COMMITTED and only lost its ack: a
         * RELEASE here would then refund a charge that stands.
         *
         * It cannot. `credit_ledger.settles_entry_id` is UNIQUE, and
         * `app.apply_ledger_entry` checks for an existing settlement while
         * holding `SELECT … FOR UPDATE` on the balance row. A hold already
         * settled by that DEBIT makes this RELEASE lose the race and raise
         * HOLD_ALREADY_SETTLED — which `apps/jobs/src/holds/sweep.ts` already
         * treats as a correct no-op. The swallow below is that outcome.
         *
         * And the retry stays exactly-once either way. `nextAttempt` advances
         * only when the last hold was settled by a RELEASE: if the DEBIT
         * committed, `settledBy` stays `debit`, the attempt is REUSED, and the
         * same `debitKey` replays instead of charging again.
         */
        try {
          await port.apply({
            workspaceId,
            entryType: 'RELEASE',
            amount: cost,
            idempotencyKey: releaseKey(hKey),
            settlesEntryId: holdId,
          })
        } catch {
          // Swallowed for the same reason the RUN path swallows it: either the
          // hold is already settled (nothing to do) or the expired-hold sweep is
          // the backstop. Neither changes the honest error below.
        }
        notifyError(settleErr, traceId)
        return err(appError('PROVIDER_ERROR', GENERIC_FAILURE, traceId))
      }

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

/**
 * Run the external-cost resolver defensively.
 *
 * Every failure mode lands on `undefined`, which writes null to `cogs_usd_est` — exactly what
 * the column held before this seam existed. The reasons it is this paranoid:
 *
 *  - a THROW or rejection would escape into the outer backstop and turn a successful, already
 *    -run action into PROVIDER_ERROR, releasing nothing and confusing a customer whose work
 *    actually completed;
 *  - NaN / Infinity would be handed to a `numeric` column as a value Postgres rejects, which
 *    would fail the DEBIT itself — the settle, not the annotation;
 *  - a NEGATIVE cost is meaningless here and would read as a credit in any margin report
 *    built on this column later.
 *
 * `0` is deliberately kept: "this post cost us nothing" is a real, useful answer and must not
 * be indistinguishable from "nobody knows".
 */
async function resolveExternalCost(
  resolver: ExternalCostResolver | undefined,
  notifyError: (cause: unknown, traceId: string) => void,
  traceId: string,
  ctx: ExternalCostContext,
): Promise<number | undefined> {
  if (!resolver) return undefined
  try {
    const value = await resolver(ctx)
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return undefined
    return value
  } catch (cause) {
    notifyError(cause, traceId)
    return undefined
  }
}

function isCreditInsufficient(e: unknown): boolean {
  return messageOf(e).includes('CREDIT_INSUFFICIENT')
}

function messageOf(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}
