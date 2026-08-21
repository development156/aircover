import 'server-only'

import { createPgLedgerPort, loadBillingEnv, type PgLedgerPort } from '@sahoda/billing'
import { toChannelSet, type Channel, type ChannelSet } from '@sahoda/shared'

/**
 * THE EXECUTOR'S WRITE PATH — a direct Postgres connection, server-only.
 *
 * `playbook_runs` and `playbook_run_items` carry READ-ONLY tenant policies: a
 * member may look at what a Playbook did and may not edit it, because those rows
 * are the record of what they were charged for. The RLS-scoped client therefore
 * cannot write them, deliberately.
 *
 * Everything here runs as the table owner and BYPASSES RLS, exactly as
 * `lib/loop/store.ts`, apps/jobs and the credit ledger already do. That makes
 * `workspaceId` a parameter this module is TRUSTED with rather than one it
 * verifies — so every function takes it explicitly, every statement carries it in
 * the WHERE clause, and the callers are server actions that have already resolved
 * it through `workspaceForWrite()`. `server-only` keeps this out of a client
 * bundle.
 *
 * The pool is borrowed from `createPgLedgerPort` rather than opened fresh: it
 * inherits the idle-client error guard (node-postgres emits 'error' on the Pool
 * when an idle client dies, and with no listener Node kills the process) and it
 * adds no second set of connections against the same pooler.
 */

let portSingleton: PgLedgerPort | undefined

function getPool(): PgLedgerPort['pool'] {
  if (!portSingleton) {
    const { databaseUrl } = loadBillingEnv()
    portSingleton = createPgLedgerPort({ connectionString: databaseUrl })
  }
  return portSingleton.pool
}

export interface PlaybookRow {
  id: string
  workspace_id: string
  recipe_key: string
  enabled: boolean
  params: Record<string, unknown>
  trigger_kind: 'manual' | 'schedule' | 'event'
  cadence: 'daily' | 'weekly' | null
  last_run_at: string | null
}

export interface RunRow {
  id: string
  workspace_id: string
  playbook_id: string
  recipe_key: string
  status: string
  trigger_source: string
  trigger_detail: Record<string, unknown>
  estimated_credits: number | null
  cost_approved_at: string | null
  approved_credits: number | null
  spent_credits: number
  failure_reason: string | null
  started_at: string
  finished_at: string | null
}

export interface ItemRow {
  id: string
  workspace_id: string
  run_id: string
  position: number
  title: string
  body: string
  channels: ChannelSet
  suggested_slot: string | null
  estimated_credits: number
  included: boolean
  post_id: string | null
  outcome: string
}

/** Channels come back as a raw text[]; parse to a SET at the boundary, once. */
function toItem(row: Omit<ItemRow, 'channels'> & { channels: string[] }): ItemRow {
  return { ...row, channels: toChannelSet(row.channels as Channel[]) }
}

export async function readPlaybooks(workspaceId: string): Promise<PlaybookRow[]> {
  const r = await getPool().query<PlaybookRow>(
    `select id, workspace_id, recipe_key, enabled, params, trigger_kind, cadence, last_run_at
       from playbooks where workspace_id = $1 order by recipe_key`,
    [workspaceId],
  )
  return r.rows
}

/**
 * Create or update the enrolment for one recipe.
 *
 * An UPSERT on `(workspace_id, recipe_key)` rather than a read-then-write,
 * because the unique constraint is what makes "one enrolment per recipe" true
 * and a read-then-write would race two tabs into a constraint violation the
 * customer would see as an error.
 */
export async function upsertPlaybook(input: {
  workspaceId: string
  recipeKey: string
  enabled: boolean
  params: Record<string, unknown>
  triggerKind: 'manual' | 'schedule' | 'event'
  cadence: 'daily' | 'weekly' | null
  userId: string
}): Promise<string> {
  const r = await getPool().query<{ id: string }>(
    `insert into playbooks (workspace_id, recipe_key, enabled, params, trigger_kind, cadence, created_by)
     values ($1, $2, $3, $4::jsonb, $5, $6, $7)
     on conflict (workspace_id, recipe_key) do update
       set enabled = excluded.enabled,
           params = excluded.params,
           trigger_kind = excluded.trigger_kind,
           cadence = excluded.cadence
     returning id`,
    [
      input.workspaceId,
      input.recipeKey,
      input.enabled,
      JSON.stringify(input.params),
      input.triggerKind,
      input.cadence,
      input.userId,
    ],
  )
  return r.rows[0]!.id
}

export async function setEnabled(
  playbookId: string,
  workspaceId: string,
  enabled: boolean,
): Promise<void> {
  await getPool().query(`update playbooks set enabled = $3 where id = $1 and workspace_id = $2`, [
    playbookId,
    workspaceId,
    enabled,
  ])
}

export async function readPlaybook(
  playbookId: string,
  workspaceId: string,
): Promise<PlaybookRow | null> {
  const r = await getPool().query<PlaybookRow>(
    `select id, workspace_id, recipe_key, enabled, params, trigger_kind, cadence, last_run_at
       from playbooks where id = $1 and workspace_id = $2`,
    [playbookId, workspaceId],
  )
  return r.rows[0] ?? null
}

/**
 * Open a run, or return null when one is already live.
 *
 * `on conflict do nothing` against the partial unique index, so a double-fired
 * cron and a double-clicked button both resolve to ONE run rather than to a
 * constraint error the caller has to interpret. Null here means "there is
 * already one", which is a normal answer and not a failure.
 *
 * ── THE ARBITER IS INFERRED, AND IT MUST BE — MEASURED 2026-08-22 ───────────
 * This was written as `on conflict on constraint
 * playbook_runs_one_live_per_playbook`, which reads correctly and does not work:
 * that name belongs to a CREATE UNIQUE INDEX, so it has no `pg_constraint` row,
 * and Postgres answers
 *
 *     constraint "playbook_runs_one_live_per_playbook" for table
 *     "playbook_runs" does not exist
 *
 * Every route into this feature — "Run it now" and the first cron tick — would
 * have thrown on its first use. Nothing caught it: the migration suite proves
 * the index with a direct INSERT, the action suite mocks this module wholesale,
 * and the production walk hand-wrote the same INSERT rather than calling here.
 * A statement no test executes is a statement nobody has run.
 *
 * The index-inference form below is what works, and the WHERE clause has to be
 * repeated verbatim: it is how Postgres identifies which partial index to use as
 * the arbiter, so this predicate and the one in 20260822030000_playbooks.sql are
 * one fact in two files. `playbooks.pglite.test.ts` runs this exact statement
 * twice and asserts the second returns nothing.
 */
export async function openRun(input: {
  workspaceId: string
  playbookId: string
  recipeKey: string
  triggerSource: 'manual' | 'schedule' | 'event'
  userId: string | null
}): Promise<string | null> {
  const r = await getPool().query<{ id: string }>(
    `insert into playbook_runs (workspace_id, playbook_id, recipe_key, trigger_source, created_by)
     values ($1, $2, $3, $4, $5)
     on conflict (playbook_id) where status in ('proposing', 'awaiting_cost_approval', 'running')
       do nothing
     returning id`,
    [input.workspaceId, input.playbookId, input.recipeKey, input.triggerSource, input.userId],
  )
  return r.rows[0]?.id ?? null
}

export interface ProposedItem {
  title: string
  body: string
  channels: readonly Channel[]
  suggestedSlot: string | null
  estimatedCredits: number
}

/** Write what the proposal step decided to make. Positions are 1-based and dense. */
export async function writeItems(
  runId: string,
  workspaceId: string,
  items: readonly ProposedItem[],
): Promise<void> {
  const pool = getPool()
  for (const [index, item] of items.entries()) {
    await pool.query(
      `insert into playbook_run_items
         (workspace_id, run_id, position, title, body, channels, suggested_slot, estimated_credits)
       values ($1, $2, $3, $4, $5, $6::text[], $7, $8)`,
      [
        workspaceId,
        runId,
        index + 1,
        item.title,
        item.body,
        // De-duplicated through the ONE shared helper. Hand-rolling this is what
        // shipped three separate duplicate-channel defects in this product.
        [...toChannelSet(item.channels)],
        item.suggestedSlot,
        item.estimatedCredits,
      ],
    )
  }
}

/** THE HALT. Records the estimate and stops. Nothing has been charged. */
export async function haltForCostApproval(
  runId: string,
  workspaceId: string,
  estimatedCredits: number,
  triggerDetail: Record<string, unknown>,
): Promise<void> {
  await getPool().query(
    `update playbook_runs
        set status = 'awaiting_cost_approval', estimated_credits = $3, trigger_detail = $4::jsonb
      where id = $1 and workspace_id = $2 and status = 'proposing'`,
    [runId, workspaceId, estimatedCredits, JSON.stringify(triggerDetail)],
  )
}

/** The trigger fired and there was nothing. An ending, not a failure, and free. */
export async function finishNothingToDo(runId: string, workspaceId: string): Promise<void> {
  await getPool().query(
    `update playbook_runs set status = 'nothing_to_do', finished_at = now()
      where id = $1 and workspace_id = $2`,
    [runId, workspaceId],
  )
}

/**
 * THE GATE, re-read from the database.
 *
 * `cost_approved_at is not null` is in the WHERE clause, so this is a FRESH read
 * of the row about to be spent against — not a belief about a row fetched a
 * moment ago in another request. The RPC's refusal protects the screen; this
 * protects the executor, which writes over an owner connection and could
 * otherwise set the status itself.
 */
export async function readApprovedRunForExecute(
  runId: string,
  workspaceId: string,
): Promise<RunRow | null> {
  const r = await getPool().query<RunRow>(
    `select * from playbook_runs
      where id = $1 and workspace_id = $2
        and status = 'awaiting_cost_approval'
        and cost_approved_at is not null`,
    [runId, workspaceId],
  )
  return r.rows[0] ?? null
}

export async function setRunStatus(
  runId: string,
  workspaceId: string,
  status: string,
  failureReason?: string,
): Promise<void> {
  await getPool().query(
    `update playbook_runs set status = $3, failure_reason = coalesce($4, failure_reason)
      where id = $1 and workspace_id = $2`,
    [runId, workspaceId, status, failureReason ?? null],
  )
}

export async function readItems(runId: string, workspaceId: string): Promise<ItemRow[]> {
  const r = await getPool().query<Omit<ItemRow, 'channels'> & { channels: string[] }>(
    `select * from playbook_run_items where run_id = $1 and workspace_id = $2 order by position`,
    [runId, workspaceId],
  )
  return r.rows.map(toItem)
}

export async function linkItemToPost(
  itemId: string,
  workspaceId: string,
  postId: string | null,
  outcome: string,
): Promise<void> {
  await getPool().query(
    `update playbook_run_items set post_id = $3, outcome = $4 where id = $1 and workspace_id = $2`,
    [itemId, workspaceId, postId, outcome],
  )
}

export async function addSpend(runId: string, workspaceId: string, credits: number): Promise<void> {
  await getPool().query(
    `update playbook_runs set spent_credits = spent_credits + $3 where id = $1 and workspace_id = $2`,
    [runId, workspaceId, credits],
  )
}

export async function finishRun(runId: string, workspaceId: string): Promise<void> {
  await getPool().query(
    `update playbook_runs set status = 'completed', finished_at = now()
      where id = $1 and workspace_id = $2`,
    [runId, workspaceId],
  )
}

export async function markRan(playbookId: string, workspaceId: string): Promise<void> {
  await getPool().query(
    `update playbooks set last_run_at = now() where id = $1 and workspace_id = $2`,
    [playbookId, workspaceId],
  )
}

export interface RunWithItems extends RunRow {
  items: ItemRow[]
}

/** The history screen's read: recent runs and what each produced. */
export async function readRecentRuns(workspaceId: string, limit = 10): Promise<RunWithItems[]> {
  const runs = await getPool().query<RunRow>(
    `select * from playbook_runs where workspace_id = $1 order by started_at desc limit $2`,
    [workspaceId, limit],
  )
  if (runs.rows.length === 0) return []
  const items = await getPool().query<Omit<ItemRow, 'channels'> & { channels: string[] }>(
    `select * from playbook_run_items
      where workspace_id = $1 and run_id = any($2::uuid[]) order by position`,
    [workspaceId, runs.rows.map((r) => r.id)],
  )
  const byRun = new Map<string, ItemRow[]>()
  for (const row of items.rows) {
    const list = byRun.get(row.run_id) ?? []
    list.push(toItem(row))
    byRun.set(row.run_id, list)
  }
  return runs.rows.map((r) => ({ ...r, items: byRun.get(r.id) ?? [] }))
}

/** The run a person is currently being asked to approve, if there is one. */
export async function readLiveRun(workspaceId: string): Promise<RunWithItems | null> {
  const r = await getPool().query<RunRow>(
    `select * from playbook_runs
      where workspace_id = $1 and status = 'awaiting_cost_approval'
      order by started_at desc limit 1`,
    [workspaceId],
  )
  const run = r.rows[0]
  if (!run) return null
  return { ...run, items: await readItems(run.id, workspaceId) }
}

/**
 * Which scheduled playbooks are due, across every workspace.
 *
 * The due-check is `last_run_at` against the cadence rather than a stored
 * next-run timestamp: a crashed tick leaves `last_run_at` where it was, so the
 * playbook is simply still due, and no repair job has to exist to unstick it.
 */
export async function dueScheduledPlaybooks(limit: number): Promise<PlaybookRow[]> {
  const r = await getPool().query<PlaybookRow>(
    `select id, workspace_id, recipe_key, enabled, params, trigger_kind, cadence, last_run_at
       from playbooks
      where enabled
        and trigger_kind = 'schedule'
        and (
          last_run_at is null
          or (cadence = 'daily'  and last_run_at < now() - interval '20 hours')
          or (cadence = 'weekly' and last_run_at < now() - interval '6 days')
        )
      order by workspace_id
      limit $1`,
    [limit],
  )
  return r.rows
}

/**
 * What this workspace can actually spend right now.
 *
 * Read through the ledger port, so it is the same arithmetic the HOLD uses —
 * total minus what is already held. A preview that quoted `total` would tell
 * somebody they can afford a run whose credits are already reserved by another
 * one in flight.
 */
export async function availableCredits(workspaceId: string): Promise<number | null> {
  try {
    if (!portSingleton) getPool()
    const bal = await portSingleton!.balance(workspaceId)
    return bal.total - bal.held
  } catch {
    // A balance that cannot be read is NOT zero. Returning null lets the preview
    // say "we could not read your balance" instead of "you have none", which are
    // different sentences and only one of them is true.
    return null
  }
}

/**
 * The per-channel variants of a drafted post.
 *
 * Written here, over the owner connection, rather than handed to the client to
 * save: this runs inside the credited action, and a variant set that only exists
 * if the browser is still open would make the charge cover work that can vanish.
 */
export async function writeVariants(
  workspaceId: string,
  postId: string,
  variants: readonly { channel: string; body: string; extras?: unknown }[],
): Promise<void> {
  const pool = getPool()
  for (const v of variants) {
    await pool.query(
      `insert into post_variants (workspace_id, post_id, channel, body, extras, char_count)
       values ($1, $2, $3, $4, $5::jsonb, $6)`,
      [workspaceId, postId, v.channel, v.body, JSON.stringify(v.extras ?? null), v.body.length],
    )
  }
}

/**
 * The Autonomy Dial's rows, over the owner connection.
 *
 * The screen reads the same table through the RLS-scoped Supabase client; the
 * scheduled runner has no Clerk session and reads it here. Both go to
 * `loop_channel_autonomy` — there is ONE dial in this product, and a second one
 * for Playbooks would be a second answer to "may Sahoda publish this".
 */
export async function readChannelAutonomy(
  workspaceId: string,
): Promise<{ channel: string; level: number }[]> {
  const r = await getPool().query<{ channel: string; level: number }>(
    `select channel, level from loop_channel_autonomy where workspace_id = $1`,
    [workspaceId],
  )
  return r.rows
}
