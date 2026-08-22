import type { ApplyLedgerInput } from '@sahoda/shared'

/**
 * The narrow ledger surface `withCredits` depends on. The only concrete
 * implementation is the direct-Postgres port in `./pg` (the ledger function lives
 * in the non-PostgREST `app` schema, so billing reaches it over a `pg` Pool, never
 * supabase-js). Keeping this an interface lets the wrapper be unit-tested with an
 * in-memory fake — no database, no mocks of a real client.
 */
export interface LedgerPort {
  /** Apply one entry via `app.apply_ledger_entry()` — the single ledger write path. */
  apply(input: ApplyLedgerInput): Promise<LedgerApplyResult>
  /** The most recent HOLD for a (workspace, action, objectRef) triple, for attempt derivation. */
  latestHold(ref: HoldLookup): Promise<LatestHold | null>
  /** Current materialized balance — read to report the exact shortfall on CREDIT_INSUFFICIENT. */
  balance(workspaceId: string): Promise<LedgerBalance>
}

/** What `app.apply_ledger_entry()` returns: the new entry plus whether the key replayed. */
export interface LedgerApplyResult {
  /**
   * `amount` is the value the LEDGER holds, signed exactly as the row stores it —
   * negative only for ADJUST. On a replay the function returns the ORIGINAL row, so
   * this is the only way a caller can learn what was really recorded rather than
   * what it just asked for. `applyReversal` needs precisely that: the amount it
   * computed and the amount on the entry are different numbers whenever a lost
   * acknowledgement brings the same dispute back after the balance has moved.
   */
  entry: { id: string; balanceAfter: number; amount: number }
  replayed: boolean
}

export interface LedgerBalance {
  total: number
  held: number
}

export interface HoldLookup {
  workspaceId: string
  action: string
  objectRef: string
}

/**
 * How the latest hold was settled — the distinction is money-critical:
 *  - 'debit'   → the operation ALREADY charged; a retry must REUSE the attempt so the DEBIT
 *               replays idempotently (never double-charge on a committed-but-lost-ack DEBIT).
 *  - 'release' → the prior attempt was refunded; a retry is safe to ADVANCE to a fresh hold.
 *  - null      → still open (crash between HOLD and settle) → resume the same attempt.
 */
export type HoldSettlement = 'debit' | 'release' | null

/** The attempt number of the latest hold + how (if at all) it has been settled. */
export interface LatestHold {
  attempt: number
  settledBy: HoldSettlement
}
