import { schedules } from '@trigger.dev/sdk'
import { sweepExpiredHolds, type HoldSweepReport } from '../holds/sweep'
import { holdSweepDeps } from '../runtime'

export const HOLD_SWEEP_TASK_ID = 'hold-sweep'

/**
 * The expired-hold reaper on a 5-minute cadence. A thin wrapper: all behaviour lives in
 * sweepExpiredHolds, which releases through app.apply_ledger_entry() and treats losing a
 * settlement race to a late DEBIT as a no-op rather than an error.
 *
 * Overlap is harmless even if a sweep runs long: candidates are re-read each run and the
 * release key is derived from the hold, so a repeat is an idempotent replay, not a
 * double-release.
 */
export const holdSweepTask = schedules.task({
  id: HOLD_SWEEP_TASK_ID,
  cron: '*/5 * * * *',
  run: async (): Promise<HoldSweepReport> => sweepExpiredHolds(holdSweepDeps()),
})
