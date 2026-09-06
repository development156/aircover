/**
 * THE STALE-CYCLE REAPER — age out Loop cycles that will never finish on their own.
 *
 * ── THE STRANDING THIS EXISTS TO END ─────────────────────────────────────────
 * A cycle is `one live per week`: `loop_cycles_one_live_per_week` is a partial
 * unique index over `(workspace_id, iso_year, iso_week)` for every non-terminal
 * status, so while a cycle sits in a live status no second cycle can open for
 * that week. Two live states can sit there for ever with nobody watching:
 *
 *   • `awaiting_cost_approval` — priced, nothing spent, waiting on a person who
 *     may never come back. This is the deliberate halt (docs/26, loop.ts), and a
 *     halt with no timeout is a slot held hostage.
 *   • `planning` / `reflecting` / `collecting` / `creating` / `testing` /
 *     `staging` — the model or the process died mid-stage. Nothing advances the
 *     row, `TERMINAL_CYCLE_STATUSES` never covers it, and the week is wedged.
 *
 * Neither is aged out by anything: the expired-HOLD sweep reaps stranded credits
 * but never touches `loop_cycles`, so the row — and the week's only slot — lives
 * for ever. This sweep moves such a cycle to `cancelled` (the codebase has no
 * `expired` cycle status; the check constraint in `20260820000300_loop_cycles.sql`
 * lists `cancelled` as the terminal "stopped" value, so that is the real value
 * written). `cancelled` is terminal, so the partial index releases the week and a
 * fresh cycle can open.
 *
 * ── HOLDS ARE RELEASED THROUGH THE LEDGER, NEVER RAW ─────────────────────────
 * A cycle that died mid-`creating` may hold credits. Each outstanding HOLD is
 * released through `deps.releaseHold`, which is `app.apply_ledger_entry()` under
 * a RELEASE keyed on the hold it settles — the same idempotent path the kill
 * switch uses, and the expired-HOLD sweep is the backstop for any this misses.
 *
 * ── WORKSPACE-AGNOSTIC, LIKE THE OTHER SWEEPS ────────────────────────────────
 * It runs across every workspace on the service-role pool. `workspaceId` rides
 * on each candidate rather than being resolved per request. The staleness
 * decision lives HERE, not in the query, so it is unit-testable with a fake that
 * simply hands over rows — a fresh row handed in is examined and left alone.
 */

/**
 * How long a cycle may sit in a live status before this sweep ages it out, per
 * status. `awaiting_cost_approval` gets the longest rope because a person is
 * meant to be looking at it; the working stages get a day, which is far past any
 * honest run and safely past a transient stall.
 *
 * A live status not named here falls back to the working-stage threshold, so a
 * status added later cannot silently become un-sweepable.
 */
export const CYCLE_STALE_AFTER_HOURS = {
  awaiting_cost_approval: 72,
  collecting: 24,
  reflecting: 24,
  planning: 24,
  creating: 24,
  testing: 24,
  staging: 24,
} as const

/** The working-stage threshold, used for any live status not in the table above. */
const DEFAULT_STALE_AFTER_HOURS = 24

/**
 * Terminal statuses, character-identical to `TERMINAL_CYCLE_STATUSES` in
 * `packages/shared/src/db/loop.ts`. A candidate in one of these is already over
 * and is never swept — a defensive skip, since the candidate query already
 * excludes them.
 */
const TERMINAL_STATUSES = new Set(['reported', 'cancelled', 'failed'])

const MS_PER_HOUR = 3_600_000

/** One live cycle the sweep may age out. */
export interface StaleCycleCandidate {
  id: string
  workspaceId: string
  status: string
  /** When the cycle opened, as an ISO-8601 timestamp. */
  startedAt: string
}

/** A HOLD that a cancelled cycle left reserved, to be released through the ledger. */
export interface ReleasableHold {
  /** `credit_ledger.id` of the HOLD — the RELEASE settles exactly this row. */
  entryId: string
  /** The HOLD's own amount, which the RELEASE balance math uses. */
  amount: number
}

/** The outcome of trying to expire one cycle. */
export interface ExpireCycleResult {
  /**
   * Whether THIS call moved the row to `cancelled`. False means the guarded
   * UPDATE matched nothing — the cycle reached a terminal status between the
   * list and now, and losing that race is correct.
   */
  expired: boolean
  /** HOLDs the cancelled cycle left outstanding. Empty unless `expired` is true. */
  holds: ReleasableHold[]
}

export interface LoopSweepDeps {
  /** Injected clock, so staleness is testable without waiting a day. */
  now?(): Date
  /** Every live cycle across every workspace, oldest first, already batch-bounded. */
  listLiveCycles(): Promise<StaleCycleCandidate[]>
  /**
   * Move ONE cycle to `cancelled` and return the HOLDs it left outstanding. The
   * status write is guarded by `status not in (terminal)`, so a cycle that
   * finished between the list and here is left alone and returns no holds.
   */
  expireCycle(input: { cycleId: string; workspaceId: string }): Promise<ExpireCycleResult>
  /** Release one outstanding HOLD through `app.apply_ledger_entry()`. */
  releaseHold(input: { workspaceId: string; hold: ReleasableHold }): Promise<void>
  /** Receives the real error so the route can log it. Never reaches the response. */
  onError?(cycleId: string, error: unknown): void
}

export interface LoopSweepReport {
  /** Live cycles examined this tick. */
  scanned: number
  /** Cycles moved to `cancelled` because they were past their threshold. */
  expired: number
}

/**
 * One pass: examine the live cycles, expire the stale ones, release their holds.
 *
 * One cycle's failure never aborts the sweep — a poison row would otherwise
 * strand every later workspace's week. A hold-release failure is likewise
 * swallowed after `onError`: the cycle is already cancelled (the slot is freed,
 * which is the point) and the expired-HOLD sweep is the backstop for the credit.
 */
export async function runLoopSweep(deps: LoopSweepDeps): Promise<LoopSweepReport> {
  const now = (deps.now?.() ?? new Date()).getTime()
  const candidates = await deps.listLiveCycles()

  const report: LoopSweepReport = { scanned: candidates.length, expired: 0 }

  for (const cycle of candidates) {
    if (!isStale(cycle, now)) continue

    let result: ExpireCycleResult
    try {
      result = await deps.expireCycle({ cycleId: cycle.id, workspaceId: cycle.workspaceId })
    } catch (error) {
      deps.onError?.(cycle.id, error)
      continue
    }

    // Count an expiry only when THIS call moved the row. A cycle that reached a
    // terminal status between the list and now returns `expired: false` — losing
    // that race is correct and is not this sweep's doing.
    if (!result.expired) continue
    report.expired += 1

    for (const hold of result.holds) {
      try {
        await deps.releaseHold({ workspaceId: cycle.workspaceId, hold })
      } catch (error) {
        deps.onError?.(cycle.id, error)
      }
    }
  }

  return report
}

/** True once a cycle has sat in its live status past the threshold for that status. */
function isStale(cycle: StaleCycleCandidate, nowMs: number): boolean {
  if (TERMINAL_STATUSES.has(cycle.status)) return false
  const startedMs = new Date(cycle.startedAt).getTime()
  if (Number.isNaN(startedMs)) return false
  const ageHours = (nowMs - startedMs) / MS_PER_HOUR
  const threshold =
    CYCLE_STALE_AFTER_HOURS[cycle.status as keyof typeof CYCLE_STALE_AFTER_HOURS] ??
    DEFAULT_STALE_AFTER_HOURS
  return ageHours >= threshold
}
