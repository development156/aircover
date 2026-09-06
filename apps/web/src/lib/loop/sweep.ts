import type { ApplyLedgerInput } from '@sahoda/shared'

import { isoWeekOf } from './iso-week'

/**
 * THE LOOP'S RECOVERY SWEEP. Two states no other code path ever left.
 *
 * ── (a) A PLAN TORN DOWN MID-FLIGHT ──────────────────────────────────────────
 * The Sunday cron and "Plan my week" both run collect, reflect and plan inside
 * one serverless invocation. When that invocation dies (a wall-clock kill, a
 * deploy, a pool error) the row stays `collecting`, `reflecting` or `planning`
 * for ever. Three things follow: the 20-credit HOLD stays open until the
 * ledger's expired-hold sweep notices it; the partial unique index
 * `loop_cycles_one_live_per_week` still counts the row as live, so every later
 * press says "already running" for the rest of the week; and /loop shows a
 * week that is "running" and never will be.
 *
 * No stage takes anywhere near thirty minutes (the platform ceiling for the
 * invocation is five), so a row that has not moved in that long is not slow.
 * It is dead. It is marked `failed` with reason `STALE`, every unsettled HOLD
 * written under its ref is released, and `spent_credits` is set from what the
 * ledger actually DEBITed under that ref, so the screen can say "nothing was
 * charged" only when that is true. A crash between the plan's DEBIT and the
 * halt leaves a real charge behind, and the copy must not deny it.
 *
 * ── (b) A COST PREVIEW NOBODY ANSWERED ───────────────────────────────────────
 * `awaiting_cost_approval` is the halt the schema is built around, and it had
 * no exit but a person. A halt for week 36 that nobody approved is still "live"
 * in week 38; /loop shows only the newest cycle, so the moment next week's
 * opened, the unanswered one disappeared with its twenty credits. It is now
 * `cancelled` with reason `UNAPPROVED` once its week has passed, or once it has
 * sat for seven days, and its unmade briefs are marked `skipped` exactly as the
 * kill switch marks them.
 *
 * ── WHAT IT DOES NOT TOUCH ───────────────────────────────────────────────────
 * `creating`, `staging` and `testing`. Those are cycles that were approved and
 * are part-way through spending; a person gets a resume control for them, and
 * a sweep that failed one would strand drafts that were already paid for.
 *
 * ── HOW IT WRITES ────────────────────────────────────────────────────────────
 * Read the candidates, then one guarded UPDATE per cycle whose WHERE repeats
 * the status precondition. The candidate list is a snapshot; by the time the
 * write runs the orchestrator may have advanced the row, and an UPDATE keyed on
 * id alone would overwrite that transition. A write that matches nothing is
 * counted as nothing. One workspace's failure is counted and never re-thrown,
 * because the other workspaces' credits are not its business.
 *
 * `now` is a parameter, never read here, for the reason `iso-week.ts` gives:
 * the same row must get the same verdict whichever minute the test runs in.
 */

export type LoopSweepMode = 'off' | 'report' | 'on'

/**
 * `SAHODA_LOOP_SWEEP_MODE`, exact-match. Absent or misspelt is `off`: this
 * sweep writes ledger entries and cancels cycles, and a typo must land on the
 * side that does nothing, the rule `loop-enabled.ts` gives for the Loop cron.
 * `report` reads the candidates and writes nothing, like the hold sweep.
 */
export function readLoopSweepMode(
  source: Partial<Record<string, string | undefined>> = process.env,
): LoopSweepMode {
  const raw = source.SAHODA_LOOP_SWEEP_MODE
  return raw === 'on' || raw === 'report' ? raw : 'off'
}

/** A plan that has not moved in this long is dead, not slow. */
export const STALE_AFTER_MINUTES = 30
/** A halt nobody answered in this long is abandoned, whatever week it is for. */
export const UNAPPROVED_AFTER_DAYS = 7
/** Never an unbounded set; a backlog drains across five-minute ticks. */
const BATCH = 50

/**
 * The narrowest pool this needs. `pg.Pool` and a PGlite instance both satisfy
 * it, which is what lets `sweep.pglite.test.ts` send the real statements to a
 * real Postgres without a `pg` import in apps/web.
 */
export interface SweepPool {
  query<R>(text: string, values?: unknown[]): Promise<{ rows: R[] }>
}

/** The one ledger write this sweep makes, through the one ledger write path. */
export interface SweepLedger {
  apply(input: ApplyLedgerInput): Promise<unknown>
}

export interface LoopSweepDeps {
  pool: SweepPool
  ledger: SweepLedger
  now: Date
  mode: LoopSweepMode
}

export interface LoopSweepReport {
  mode: LoopSweepMode
  /** Plans older than the threshold, and how many the guarded write actually failed. */
  staleFound: number
  staleFailed: number
  /** Open HOLDs under failed cycles' refs, and what became of them. */
  holdsFound: number
  holdsReleased: number
  holdsAlreadySettled: number
  /** Halts past their week or their seven days, and how many were actually cancelled. */
  unapprovedFound: number
  unapprovedCancelled: number
  briefsSkipped: number
  /** Writes that threw. Counted here, reported to the caller's `onError`, never re-thrown. */
  failed: number
}

// ── THE STATEMENTS ───────────────────────────────────────────────────────────
// Exported so the unit test can key a fake pool on them and the PGlite test can
// send the very same text to a real Postgres. Nothing below builds a string.

export const STALE_CANDIDATES_SQL = `
  select id, workspace_id
    from loop_cycles
   where status in ('collecting', 'reflecting', 'planning')
     and updated_at < $1::timestamptz - interval '${STALE_AFTER_MINUTES} minutes'
   order by updated_at
   limit $2`

/**
 * Guarded on the status it was found in. `spent_credits` is set from the
 * ledger's DEBITs under this cycle's ref: the orchestrator only mirrors the
 * plan charge into that column AFTER the halt, so a crash between the DEBIT
 * and the halt leaves a real charge the column does not know about.
 */
export const FAIL_STALE_SQL = `
  update loop_cycles as c
     set status = 'failed',
         failure_reason = 'STALE',
         spent_credits = greatest(
           c.spent_credits,
           coalesce((
             select sum(d.amount)::int
               from credit_ledger d
              where d.workspace_id = c.workspace_id
                and d.entry_type = 'DEBIT'
                and d.object_ref like 'loop:cycle:' || c.id::text || ':%'
           ), 0)
         )
   where c.id = $1
     and c.status in ('collecting', 'reflecting', 'planning')
   returning c.id, c.workspace_id`

/**
 * Unsettled HOLDs written under one cycle's ref. "Unsettled" is the absence of
 * any entry pointing at the HOLD through `settles_entry_id`, the same column
 * whose UNIQUE constraint gives the single-settlement guarantee, so the read
 * and the write agree on what settled means. The pattern is built in SQL from
 * a uuid, which carries no LIKE metacharacter.
 */
export const OPEN_CYCLE_HOLDS_SQL = `
  select h.id, h.amount
    from credit_ledger h
   where h.workspace_id = $1
     and h.entry_type = 'HOLD'
     and h.object_ref like 'loop:cycle:' || $2::text || ':%'
     and not exists (select 1 from credit_ledger s where s.settles_entry_id = h.id)
   order by h.seq`

export const UNAPPROVED_CANDIDATES_SQL = `
  select id, workspace_id
    from loop_cycles
   where status = 'awaiting_cost_approval'
     and (
       (iso_year, iso_week) < ($1::int, $2::int)
       or updated_at < $3::timestamptz - interval '${UNAPPROVED_AFTER_DAYS} days'
     )
   order by updated_at
   limit $4`

export const CANCEL_UNAPPROVED_SQL = `
  update loop_cycles
     set status = 'cancelled',
         failure_reason = 'UNAPPROVED'
   where id = $1
     and status = 'awaiting_cost_approval'
   returning id, workspace_id`

/** The kill switch's rule, verbatim: only briefs that were never made. */
export const SKIP_BRIEFS_SQL = `
  update loop_briefs
     set stage_outcome = 'skipped'
   where cycle_id = $1
     and workspace_id = $2
     and stage_outcome in ('planned', 'awaiting_approval')
   returning id`

interface CycleRef {
  id: string
  workspace_id: string
}

interface OpenHold {
  id: string
  amount: number
}

export async function sweepLoopCycles(deps: LoopSweepDeps): Promise<LoopSweepReport> {
  const report: LoopSweepReport = {
    mode: deps.mode,
    staleFound: 0,
    staleFailed: 0,
    holdsFound: 0,
    holdsReleased: 0,
    holdsAlreadySettled: 0,
    unapprovedFound: 0,
    unapprovedCancelled: 0,
    briefsSkipped: 0,
    failed: 0,
  }
  if (deps.mode === 'off') return report

  const nowIso = deps.now.toISOString()
  const { isoYear, isoWeek } = isoWeekOf(deps.now)

  const stale = await deps.pool.query<CycleRef>(STALE_CANDIDATES_SQL, [nowIso, BATCH])
  report.staleFound = stale.rows.length
  const unapproved = await deps.pool.query<CycleRef>(UNAPPROVED_CANDIDATES_SQL, [
    isoYear,
    isoWeek,
    nowIso,
    BATCH,
  ])
  report.unapprovedFound = unapproved.rows.length

  if (deps.mode === 'report') return report

  for (const cycle of stale.rows) await failStale(deps, cycle, report)
  for (const cycle of unapproved.rows) await cancelUnapproved(deps, cycle, report)

  return report
}

async function failStale(deps: LoopSweepDeps, cycle: CycleRef, report: LoopSweepReport) {
  let failed: CycleRef | undefined
  try {
    const r = await deps.pool.query<CycleRef>(FAIL_STALE_SQL, [cycle.id])
    failed = r.rows[0]
  } catch {
    report.failed += 1
    return
  }
  // Matched nothing: it moved on between the read and the write. Not ours.
  if (!failed) return
  report.staleFailed += 1

  let holds: OpenHold[]
  try {
    const r = await deps.pool.query<OpenHold>(OPEN_CYCLE_HOLDS_SQL, [
      failed.workspace_id,
      failed.id,
    ])
    holds = r.rows
  } catch {
    report.failed += 1
    return
  }
  report.holdsFound += holds.length

  for (const hold of holds) {
    try {
      await deps.ledger.apply({
        workspaceId: failed.workspace_id,
        entryType: 'RELEASE',
        amount: hold.amount,
        // Keyed on the hold, so a second tick, or the kill switch, or the
        // expired-hold sweep landing first, cannot refund it twice.
        idempotencyKey: `loop-sweep:release:${hold.id}`,
        settlesEntryId: hold.id,
        actor: 'job:loop_sweep',
      })
      report.holdsReleased += 1
    } catch (e) {
      if (isAlreadySettled(e)) report.holdsAlreadySettled += 1
      else report.failed += 1
    }
  }
}

async function cancelUnapproved(deps: LoopSweepDeps, cycle: CycleRef, report: LoopSweepReport) {
  try {
    const r = await deps.pool.query<CycleRef>(CANCEL_UNAPPROVED_SQL, [cycle.id])
    const cancelled = r.rows[0]
    // Approved, or killed, between the read and the write. Its briefs are
    // somebody else's now.
    if (!cancelled) return
    report.unapprovedCancelled += 1

    const briefs = await deps.pool.query<{ id: string }>(SKIP_BRIEFS_SQL, [
      cancelled.id,
      cancelled.workspace_id,
    ])
    report.briefsSkipped += briefs.rows.length
  } catch {
    report.failed += 1
  }
}

/** The ledger raises this as a bare message; the hold sweep reads it the same way. */
function isAlreadySettled(e: unknown): boolean {
  return (e instanceof Error ? e.message : String(e)).includes('HOLD_ALREADY_SETTLED')
}
