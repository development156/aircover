import { expiredReleaseKey } from '@sahoda/shared'
import type { LedgerPort } from '@sahoda/billing'

/** An unsettled HOLD past its expiry — the sweep's unit of work. */
export interface ExpiredHold {
  /** credit_ledger.id of the HOLD — the RELEASE settles exactly this row. */
  id: string
  workspaceId: string
  /** The HOLD's own amount. RELEASE balance math uses the hold's amount, so passing
   *  anything else would make the audit row lie about what was un-held. */
  amount: number
  /** The HOLD's idempotency_key — the stem the expired-release key is derived from. */
  idempotencyKey: string
}

export interface HoldSweepDeps {
  listExpiredHolds(): Promise<ExpiredHold[]>
  /** The ONLY ledger write path: `app.apply_ledger_entry()` via the billing port. */
  apply: LedgerPort['apply']
}

export interface HoldSweepReport {
  scanned: number
  released: number
  /** Lost the settlement race to a DEBIT (or a normal RELEASE) — a correct no-op. */
  alreadySettled: number
  failed: number
}

/**
 * The expired-hold reaper (apps/jobs/CLAUDE.md): RELEASE unsettled HOLDs whose TTL has
 * lapsed, so credits stranded by a crashed run return to the workspace's available
 * balance. Every write goes through `app.apply_ledger_entry()` — never raw SQL.
 *
 * Race-safety is the ledger's, not ours. `credit_ledger.settles_entry_id` is UNIQUE and
 * the function pre-checks for an existing settlement while holding `SELECT ... FOR UPDATE`
 * on the workspace balance row, so a concurrent late DEBIT and this RELEASE serialize:
 * exactly one commits and the loser raises HOLD_ALREADY_SETTLED. When the DEBIT wins,
 * the user paid for work that really completed — losing is the right outcome, so it is
 * counted separately and never surfaced as an error.
 *
 * One hold's failure never aborts the sweep: a poison row would otherwise strand every
 * later workspace's credits until someone intervened.
 */
export async function sweepExpiredHolds(deps: HoldSweepDeps): Promise<HoldSweepReport> {
  const holds = await deps.listExpiredHolds()
  const report: HoldSweepReport = {
    scanned: holds.length,
    released: 0,
    alreadySettled: 0,
    failed: 0,
  }

  for (const hold of holds) {
    try {
      await deps.apply({
        workspaceId: hold.workspaceId,
        entryType: 'RELEASE',
        amount: hold.amount,
        idempotencyKey: expiredReleaseKey(hold.idempotencyKey),
        settlesEntryId: hold.id,
        actor: 'job:hold_sweep',
      })
      report.released += 1
    } catch (e) {
      if (isAlreadySettled(e)) report.alreadySettled += 1
      else report.failed += 1
    }
  }

  return report
}

/** The ledger raises this as a bare message (mirrors billing's CREDIT_INSUFFICIENT check). */
function isAlreadySettled(e: unknown): boolean {
  return (e instanceof Error ? e.message : String(e)).includes('HOLD_ALREADY_SETTLED')
}
