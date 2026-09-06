import 'server-only'

import { createPgLedgerPort, loadBillingEnv, type PgLedgerPort } from '@sahoda/billing'
import { toChannelSet, type Channel, type ChannelSet } from '@sahoda/shared'

import type { MetricObservation } from './reflect'

/**
 * THE ORCHESTRATOR'S WRITE PATH — a direct Postgres connection, server-only.
 *
 * ── WHY NOT THE SUPABASE CLIENT THE REST OF THE APP USES ─────────────────────
 * `loop_cycles` and `loop_briefs` carry READ-ONLY tenant policies: a member may
 * look at what the Loop did and may not edit it, because those rows are the
 * record of what they were charged for. The RLS-scoped client therefore cannot
 * write them, deliberately.
 *
 * Everything here runs as the table owner and BYPASSES RLS, exactly as
 * `apps/jobs` and the credit ledger already do. That makes `workspaceId` a
 * parameter this module is trusted with rather than one it verifies — so every
 * function takes it explicitly, every statement carries it in the WHERE clause,
 * and the callers are server actions that have already resolved it through
 * `workspaceForWrite()`. `server-only` is what keeps this out of a client bundle.
 */

/**
 * The pool comes from `createPgLedgerPort`, which already builds one with the
 * right TLS settings and — importantly — with `guardPoolErrors` around it.
 *
 * ── WHY BORROW ONE RATHER THAN OPEN A SECOND ─────────────────────────────────
 * Three reasons, in order of how much they matter. It shares ONE pool with the
 * credit ledger instead of opening a second set of connections from the same
 * serverless function against the same pooler. It inherits the idle-client error
 * guard, which is mandatory on a module-level singleton — node-postgres emits
 * 'error' on the Pool when an idle client dies (pooler timeout, failover,
 * maintenance restart) and with no listener Node treats that as an uncaught
 * exception and kills the process. And it needs no `pg` type import, so
 * apps/web gains no `@types/pg` devDependency and the lockfile does not move
 * while three other lanes are working in this repo.
 */
let portSingleton: PgLedgerPort | undefined

function getPort(): PgLedgerPort {
  if (!portSingleton) {
    const { databaseUrl } = loadBillingEnv()
    portSingleton = createPgLedgerPort({ connectionString: databaseUrl })
  }
  return portSingleton
}

function getPool(): PgLedgerPort['pool'] {
  return getPort().pool
}

export interface CycleRow {
  id: string
  workspace_id: string
  iso_year: number
  iso_week: number
  status: string
  estimated_credits: number | null
  approved_credits: number | null
  cost_approved_at: string | null
  spent_credits: number
  budget_credits: number | null
  reflect_skipped_no_history: boolean
  failure_reason: string | null
  started_at: string
  reported_at: string | null
}

export interface BriefRow {
  id: string
  workspace_id: string
  cycle_id: string
  priority: number
  title: string
  body: string
  channels: ChannelSet
  suggested_slot: string | null
  rationale: string | null
  estimated_credits: number
  included: boolean
  post_id: string | null
  stage_outcome: string
}

/** Rows come back with `channels` as a raw text[]; nothing outside this file sees one. */
function toBriefRow(row: Record<string, unknown>): BriefRow {
  return {
    ...(row as unknown as Omit<BriefRow, 'channels'>),
    channels: toChannelSet((row.channels as Channel[]) ?? []),
  }
}

/**
 * The live cycle for a week, opening one if there is none.
 *
 * Returns `{ cycle, created }` so a caller can tell a fresh cycle from a resumed
 * one — the difference decides whether the orchestration charge is taken, and
 * charging a resumed cycle again is the shape of a double bill.
 *
 * The insert races against the partial unique index rather than checking first:
 * a SELECT-then-INSERT has a window in which two Sunday ticks both see nothing
 * and both insert. `on conflict do nothing` plus a re-read closes it, and the
 * loser of the race gets `created: false`, which is exactly right.
 */
export async function openCycle(input: {
  workspaceId: string
  isoYear: number
  isoWeek: number
  triggerSource: 'schedule' | 'manual'
  budgetCredits: number | null
  userId: string | null
}): Promise<{ cycle: CycleRow; created: boolean }> {
  const pool = getPool()
  const inserted = await pool.query<CycleRow>(
    `insert into loop_cycles
       (workspace_id, iso_year, iso_week, status, trigger_source, budget_credits, created_by)
     values ($1, $2, $3, 'collecting', $4, $5, $6)
     on conflict do nothing
     returning *`,
    [
      input.workspaceId,
      input.isoYear,
      input.isoWeek,
      input.triggerSource,
      input.budgetCredits,
      input.userId,
    ],
  )
  const fresh = inserted.rows[0]
  if (fresh) return { cycle: fresh, created: true }

  const existing = await pool.query<CycleRow>(
    `select * from loop_cycles
      where workspace_id = $1 and iso_year = $2 and iso_week = $3
        and status not in ('cancelled', 'failed')
      order by started_at desc limit 1`,
    [input.workspaceId, input.isoYear, input.isoWeek],
  )
  const found = existing.rows[0]
  if (!found) throw new Error('CYCLE_OPEN_FAILED')
  return { cycle: found, created: false }
}

/**
 * A cycle in a terminal status is finished, and nothing may move it.
 *
 * `cancelled` is what the kill switch writes; `failed` is what a stage writes
 * when it gives up. Both are answers to "what happened to this week", and an
 * orchestrator that is still running when one of them lands has lost the race —
 * correctly. Every status write in this module carries this clause, and the
 * functions return whether they won.
 *
 * The SQL believed this was an advisory lock's job: 20260820000400_loop_rpcs.sql
 * says the kill switch takes `pg_advisory_xact_lock('loop_cycle:'||ws)`, "the
 * same key the cycle writer takes". The cycle writer takes no lock — a grep for
 * `pg_advisory` across apps/web and apps/jobs finds none. It does not need one:
 * whichever UPDATE commits second sees the other's status through this clause.
 */
const NOT_TERMINAL = `status not in ('cancelled', 'failed')`

/** Postgres says this when a column named in a statement does not exist. */
const UNDEFINED_COLUMN = '42703'

function isMissingColumn(error: unknown): boolean {
  return (error as { code?: unknown } | null)?.code === UNDEFINED_COLUMN
}

/**
 * True when a row moved. False means a terminal status refused the write.
 *
 * ── THE reflect_reason COLUMN IS WRITTEN THROUGH A FALLBACK ──────────────────
 * `20260828100000_loop_reflect_reason.sql` adds it, and migrations here are
 * applied by hand rather than by a deploy. A statement naming a column that is
 * not there yet raises 42703, and this is the statement that moves a cycle from
 * one stage to the next — so an unapplied migration would not cost a sentence
 * on a screen, it would strand every cycle in the stage it was in.
 *
 * The same shape apps/jobs/src/metrics/store.ts uses for its missing history
 * table: try the full form, fall back on the specific code, and never on any
 * other error. Once the migration is applied the fallback is dead weight that
 * costs one failed statement per process and can be removed.
 */
export async function setCycleStatus(
  cycleId: string,
  workspaceId: string,
  status: string,
  extra: { failureReason?: string; reflectSkipped?: boolean; reflectReason?: string | null } = {},
): Promise<boolean> {
  const args = [
    cycleId,
    workspaceId,
    status,
    extra.failureReason ?? null,
    extra.reflectSkipped ?? null,
  ]
  const tail = `where id = $1 and workspace_id = $2 and ${NOT_TERMINAL}`
  const head = `update loop_cycles
        set status = $3,
            failure_reason = coalesce($4, failure_reason),
            reflect_skipped_no_history = coalesce($5, reflect_skipped_no_history)`

  try {
    const r = await getPool().query(
      `${head},
            reflect_reason = coalesce($6, reflect_reason)
      ${tail}`,
      [...args, extra.reflectReason ?? null],
    )
    return (r.rowCount ?? 0) > 0
  } catch (error) {
    if (!isMissingColumn(error)) throw error
    const r = await getPool().query(`${head}\n      ${tail}`, args)
    return (r.rowCount ?? 0) > 0
  }
}

/**
 * Last week's measurements for the Reflect stage.
 *
 * Bounded by a row cap as well as by the date window. The window is seven days
 * and a workspace could in principle have thousands of posts; the Reflect
 * arithmetic is O(n) but the transfer is not, and an unbounded read on a
 * serverless function is the kind of thing that works until one customer grows.
 */
export async function readObservations(
  workspaceId: string,
  fromIso: string,
  toIso: string,
  limit = 5000,
): Promise<MetricObservation[]> {
  const r = await getPool().query<MetricObservation>(
    `select post_id, channel, metric, value::int as value, measured_on::text as measured_on
       from post_metric_snapshots
      where workspace_id = $1 and measured_on >= $2::date and measured_on <= $3::date
      order by measured_on desc
      limit $4`,
    [workspaceId, fromIso, toIso, limit],
  )
  return r.rows
}

/**
 * Write the plan's briefs. ONE statement, so a half-written plan cannot exist.
 *
 * ── A PLAIN MULTI-ROW INSERT, AFTER A `VALUES`-DERIVED ONE FAILED LIVE ───────
 * The first version built a `from (values (...)) as v (workspace_id, ...)`
 * subquery. It parsed, it typechecked, and it threw against the real database:
 * columns derived from a bare VALUES list have no declared type, so `v.workspace_id`
 * arrives as text and the `uuid` column refuses it. A plain
 * `insert ... values ($1,$2,...), ($9,$10,...)` takes its types from the TARGET
 * COLUMNS instead, which is both simpler and the reason it works.
 *
 * Worth recording because the failure was invisible until a live run: the model
 * call had already succeeded and been logged `ok`, so the whole thing surfaced
 * as a PROVIDER_ERROR pointing at the provider, which was blameless.
 */
export async function writeBriefs(
  cycleId: string,
  workspaceId: string,
  briefs: ReadonlyArray<{
    priority: number
    title: string
    body: string
    channels: ChannelSet
    suggestedSlot: string | null
    rationale: string | null
    estimatedCredits: number
  }>,
): Promise<BriefRow[]> {
  if (briefs.length === 0) return []
  const values: unknown[] = []
  const tuples = briefs.map((b, i) => {
    const o = i * 9
    // `channels` goes in as an array parameter, already a ChannelSet — so the
    // de-duplication happened at the boundary and the database's own
    // loop_briefs_channels_is_set check is the second of two guards, not the only.
    values.push(
      workspaceId,
      cycleId,
      b.priority,
      b.title,
      b.body,
      [...b.channels],
      b.suggestedSlot,
      b.rationale,
      b.estimatedCredits,
    )
    return `($${o + 1}, $${o + 2}, $${o + 3}, $${o + 4}, $${o + 5}, $${o + 6}, $${o + 7}, $${o + 8}, $${o + 9})`
  })
  const r = await getPool().query(
    `insert into loop_briefs
       (workspace_id, cycle_id, priority, title, body, channels, suggested_slot, rationale, estimated_credits)
     values ${tuples.join(', ')}
     returning *`,
    values,
  )
  return r.rows.map(toBriefRow)
}

export async function readBriefs(cycleId: string, workspaceId: string): Promise<BriefRow[]> {
  const r = await getPool().query(
    `select * from loop_briefs where cycle_id = $1 and workspace_id = $2 order by priority`,
    [cycleId, workspaceId],
  )
  return r.rows.map(toBriefRow)
}

/**
 * Park the cycle at the halt with its estimate recorded.
 *
 * The status and the estimate move together in ONE statement. Written
 * separately, a crash between them would leave a cycle at
 * `awaiting_cost_approval` with a null estimate, and the screen would have to
 * render a preview with no number in it — the one thing the halt exists to
 * prevent.
 */
/**
 * True when a row moved. False means the cycle reached a terminal status while
 * the plan stage was running — almost always the kill switch, pressed during the
 * seconds-to-minutes a model call takes. Without the clause this write brought a
 * cancelled cycle back as `awaiting_cost_approval`, approve button and all, and
 * `loop_approve_cost` re-included every brief the kill switch had skipped.
 */
export async function haltForCostApproval(
  cycleId: string,
  workspaceId: string,
  estimatedCredits: number,
): Promise<boolean> {
  const r = await getPool().query(
    `update loop_cycles
        set status = 'awaiting_cost_approval', estimated_credits = $3
      where id = $1 and workspace_id = $2 and ${NOT_TERMINAL}`,
    [cycleId, workspaceId, estimatedCredits],
  )
  return (r.rowCount ?? 0) > 0
}

/**
 * THE CREATE-STAGE GATE, re-read from the row immediately before spending.
 *
 * `public.loop_approve_cost` refuses to advance a cycle without an approval, but
 * this module writes over an OWNER connection and could set
 * `status = 'creating'` directly — so the RPC's refusal protects the screen and
 * not the orchestrator. This is the orchestrator's own check, and it reads the
 * database rather than trusting whatever the caller believes about the cycle it
 * fetched a moment ago.
 *
 * Returns null when the cycle may NOT spend. A caller that ignores the null and
 * charges anyway is the failure this cannot prevent; `loop-cycle.test.ts`
 * asserts zero ledger writes for an unapproved cycle.
 */
export async function readApprovedCycleForCreate(
  cycleId: string,
  workspaceId: string,
): Promise<CycleRow | null> {
  const r = await getPool().query<CycleRow>(
    `select * from loop_cycles
      where id = $1 and workspace_id = $2
        and cost_approved_at is not null
        and approved_credits is not null
        and status in ('creating', 'staging')`,
    [cycleId, workspaceId],
  )
  return r.rows[0] ?? null
}

/**
 * THE CONCURRENCY CLAIM — exactly one create run may proceed per cycle.
 *
 * Two requests can both pass `readApprovedCycleForCreate` (two tabs at the halt,
 * a replayed action) and both insert a post per brief: `withCredits` dedupes the
 * CHARGE on the object ref but still RUNS the wrapped insert, so the loser's post
 * is an orphan the kill switch cannot reach. This atomic UPDATE lets one win.
 *
 * A 15-minute lease, not a permanent flag: a run that crashed mid-create leaves
 * create_started_at set, and without the lease the week could never be resumed.
 * The stale sweep is the longer backstop; this lets a person's Resume re-claim
 * once the dead run is clearly gone.
 *
 * Graceful until the migration lands: 20260906201200 adds the column, and
 * migrations here are applied by hand. A statement naming a missing column
 * raises 42703 — the same fallback `setCycleStatus` uses — and returns true so
 * the stage proceeds exactly as before the column existed.
 */
export async function claimCreateStage(cycleId: string, workspaceId: string): Promise<boolean> {
  try {
    const r = await getPool().query(
      `update loop_cycles set create_started_at = now()
       where id = $1 and workspace_id = $2
         and (create_started_at is null or create_started_at < now() - interval '15 minutes')
       returning id`,
      [cycleId, workspaceId],
    )
    return (r.rowCount ?? 0) > 0
  } catch (error) {
    if (!isMissingColumn(error)) throw error
    return true
  }
}

/**
 * Record what the create stage did with one brief.
 *
 * ── `post_id is null` IS THE IDEMPOTENCY BOUNDARY ────────────────────────────
 * A brief that already carries a post is never re-linked. The create stage can
 * be entered twice for one approved cycle (two tabs at the halt screen, or a
 * replayed action call: `loop_approve_cost` answers `replayed: true` before its
 * status check once `cost_approved_at` is set), and `withCredits` replays the
 * DEBIT without re-charging but still RUNS the wrapped function. The stage
 * filters briefs on this column before it charges anything, and this clause is
 * the second guard for the row that slipped between the read and the write:
 * an overwrite here would orphan the first post, which the kill switch can no
 * longer find because it scopes through `loop_briefs.post_id`.
 *
 * Returns whether a row moved, so a caller can tell a link from a refused one.
 */
export async function linkBriefToPost(
  briefId: string,
  workspaceId: string,
  postId: string | null,
  outcome: string,
): Promise<boolean> {
  const r = await getPool().query(
    `update loop_briefs set post_id = $3, stage_outcome = $4
      where id = $1 and workspace_id = $2 and post_id is null`,
    [briefId, workspaceId, postId, outcome],
  )
  return (r.rowCount ?? 0) > 0
}

/**
 * The per-channel bodies a brief was charged for, one row per channel.
 *
 * The same statement `lib/playbooks/store.ts` uses, because the two paths
 * charge the same `post_variants` price and must deliver the same thing. The
 * Loop had no writer at all: it charged per brief and inserted one post with
 * one body across every channel, and the dispatcher expired each one for
 * having no variants. `generated_body` takes the same `$4` as `body` (draft
 * capture, REQUESTS.md §22): every row here is model output.
 */
export async function writeVariants(
  workspaceId: string,
  postId: string,
  variants: readonly { channel: string; body: string; extras?: unknown }[],
): Promise<void> {
  const pool = getPool()
  for (const v of variants) {
    await pool.query(
      `insert into post_variants (workspace_id, post_id, channel, body, generated_body, extras, char_count)
       values ($1, $2, $3, $4, $4, $5::jsonb, $6)`,
      [workspaceId, postId, v.channel, v.body, JSON.stringify(v.extras ?? null), v.body.length],
    )
  }
}

/** Add to the cycle's running spend. Additive, so two concurrent charges both count. */
export async function addSpend(
  cycleId: string,
  workspaceId: string,
  credits: number,
): Promise<void> {
  await getPool().query(
    `update loop_cycles set spent_credits = spent_credits + $3 where id = $1 and workspace_id = $2`,
    [cycleId, workspaceId, credits],
  )
}

/**
 * True when the week was really reported.
 *
 * This function has always had the terminal guard, and it has never worked,
 * because `loop-create.ts` calls `setCycleStatus(…, 'staging')` on the line
 * above — which had no guard, so it moved a cancelled cycle to a status this
 * clause admits. A guard is worth nothing when the statement before it launders
 * the value the guard inspects.
 */
export async function finishCycle(cycleId: string, workspaceId: string): Promise<boolean> {
  const r = await getPool().query(
    `update loop_cycles set status = 'reported', reported_at = now()
      where id = $1 and workspace_id = $2 and ${NOT_TERMINAL}`,
    [cycleId, workspaceId],
  )
  return (r.rowCount ?? 0) > 0
}

/**
 * Propose a learning as a Brand Brain diff.
 *
 * INSERTS INTO `memory_events` WITH `status = 'pending'` AND TOUCHES
 * `brand_memory` NOWHERE. That is the whole contract of the Reflect stage: a
 * learning is a proposal a person accepts, and the accept path is
 * `public.resolve_memory_event`, which a person's click reaches and this does
 * not.
 */
export async function proposeLearning(
  workspaceId: string,
  diff: unknown,
  evidenceRefs: unknown,
): Promise<string> {
  const r = await getPool().query<{ id: string }>(
    `insert into memory_events (workspace_id, source, diff, status, evidence_refs)
     values ($1, 'insight', $2::jsonb, 'pending', $3::jsonb)
     returning id`,
    [workspaceId, JSON.stringify(diff), JSON.stringify(evidenceRefs)],
  )
  return r.rows[0]!.id
}

/** The most recent cycles, newest first — what the Loop screen and the report read. */
export async function readRecentCycles(workspaceId: string, limit = 5): Promise<CycleRow[]> {
  const r = await getPool().query<CycleRow>(
    `select * from loop_cycles where workspace_id = $1 order by started_at desc limit $2`,
    [workspaceId, limit],
  )
  return r.rows
}

/**
 * Concrete deps for the stale-cycle sweep (`lib/loop/sweep.ts`), on the shared
 * service-role pool. Workspace-agnostic: it reads and writes across every
 * workspace, exactly like the expired-HOLD and dispatch sweeps, and carries
 * `workspace_id` in every WHERE clause because this module runs as the table
 * owner and bypasses RLS (see the header).
 *
 * `limit` bounds the work per tick so a large backlog drains across ticks,
 * oldest first, rather than being attempted in one request.
 */
export function loopSweepDeps(limit = 50): import('./sweep').LoopSweepDeps {
  return {
    async listLiveCycles() {
      const r = await getPool().query<{
        id: string
        workspace_id: string
        status: string
        started_at: string
      }>(
        `select id, workspace_id, status, started_at
           from loop_cycles
          where status not in ('reported', 'cancelled', 'failed')
          order by started_at asc
          limit $1`,
        [limit],
      )
      return r.rows.map((row) => ({
        id: row.id,
        workspaceId: row.workspace_id,
        status: row.status,
        startedAt: row.started_at,
      }))
    },

    async expireCycle({ cycleId, workspaceId }) {
      // Guarded by the same NOT_TERMINAL clause every writer here carries, so a
      // cycle that finished between the list and now is left alone.
      const moved = await getPool().query(
        `update loop_cycles
            set status = 'cancelled',
                failure_reason = coalesce(failure_reason, 'STALE_SWEEP')
          where id = $1 and workspace_id = $2 and ${NOT_TERMINAL}
          returning id`,
        [cycleId, workspaceId],
      )
      if ((moved.rowCount ?? 0) === 0) return { expired: false, holds: [] }

      // Outstanding HOLDs for THIS cycle's orchestration charge — `newLoopCycleRef`
      // writes `loop:cycle:<cycleId>:<uuid>`, so the pattern catches the cycle's
      // own stranded hold without reaching a brief hold or another cycle's. A
      // HOLD with nothing settling it is credit reserved and not spent.
      const holds = await getPool().query<{ id: string; amount: number }>(
        `select h.id, h.amount
           from credit_ledger h
          where h.workspace_id = $1
            and h.entry_type = 'HOLD'
            and h.object_ref like $2
            and not exists (
              select 1 from credit_ledger s where s.settles_entry_id = h.id
            )`,
        [workspaceId, `loop:cycle:${cycleId}:%`],
      )
      return {
        expired: true,
        holds: holds.rows.map((row) => ({ entryId: row.id, amount: row.amount })),
      }
    },

    async releaseHold({ workspaceId, hold }) {
      // The only ledger write path. A RELEASE keyed on the hold it settles is
      // idempotent, so a second tick cannot refund the same hold twice.
      await getPort().apply({
        workspaceId,
        entryType: 'RELEASE',
        amount: hold.amount,
        idempotencyKey: `loop-sweep:release:${hold.entryId}`,
        settlesEntryId: hold.entryId,
        actor: 'job:loop_sweep',
      })
    },
  }
}
