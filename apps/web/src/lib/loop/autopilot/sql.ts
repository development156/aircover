/**
 * THE DISPATCHER'S STATEMENTS, kept where a real Postgres can adjudicate them.
 *
 * ── WHY THEY ARE NOT INLINE IN THE STORE ─────────────────────────────────────
 * This repository has the worked example. On 2026-08-23 the Sunday tick shipped
 * a query naming `loop_autonomy`, where the table is `loop_channel_autonomy`.
 * Every tick from that day raised 42P01 before a single workspace was assessed,
 * and nothing noticed for five days, because the only test over that code
 * stubbed the pool with `{ query: vi.fn() }` — a mock accepts any text at all,
 * including text that is not SQL.
 *
 * So these live in a module with no imports and no I/O, and
 * `packages/db/tests/loop_autopilot_sql.pglite.test.ts` sends every one of them
 * to a database with all 92 migrations applied. A copy of a query inside a test
 * proves the copy.
 *
 * ── THE ONE THING A PARSE CHECK STILL CANNOT SEE ─────────────────────────────
 * That the statement is CORRECT. `where decision = 'announced'` parses exactly
 * as well as `where decision = 'announce'`, and the second would scan nothing
 * for ever. The pglite test therefore inserts rows and asserts what comes back,
 * rather than only asserting that the text ran.
 */

/**
 * Every announcement still waiting: announced, window closed or not, with no
 * terminal row after it.
 *
 * ── WHY THE TERMINAL ROWS ARE EXCLUDED HERE AND RE-CHECKED IN CODE ───────────
 * The table is append-only, so a cancellation is a NEW ROW rather than an edit.
 * "Still pending" is therefore a question about the ABSENCE of a later row, and
 * `not exists` is the honest way to ask it. `decideDue` re-checks the same two
 * facts through `alreadyDispatched` and `isCancelled` — not because this clause
 * is doubted, but because the scan and the decision run at different instants
 * and a row can land between them.
 *
 * Parameters: $1 workspace_id, $2 row limit.
 */
export const PENDING_ANNOUNCEMENTS_SQL = `select a.post_id,
       a.variant_id,
       a.channel,
       a.account_id,
       a.dispatch_after
  from loop_autopilot_log a
 where a.workspace_id = $1
   and a.decision = 'announced'
   and not exists (
     select 1 from loop_autopilot_log later
      where later.workspace_id = a.workspace_id
        and later.post_id = a.post_id
        and later.variant_id = a.variant_id
        and later.decision in ('dispatched', 'cancelled')
        and later.created_at >= a.created_at
   )
 order by a.dispatch_after asc
 limit $2`

/**
 * How many posts autopilot has already put out today, in the WORKSPACE's day.
 *
 * ── WHY THE WORKSPACE'S TIMEZONE AND NOT UTC ─────────────────────────────────
 * "Three a day" is a promise about the customer's day. Counted in UTC it would
 * reset at 05:30 in the afternoon for an Indian workspace, so a customer could
 * watch six posts go out between breakfast and dinner while a cap of three was
 * in force and every row was correct. `workspaces.timezone` is the column that
 * already exists for this (`20260826200000_workspace_timezone_and_intake.sql`).
 *
 * Counts announcements as well as dispatches. An announced post is going out
 * unless somebody stops it, and a cap that only counted completed publishes
 * would announce a day's worth every tick until the first of them landed.
 *
 * Parameters: $1 workspace_id.
 */
export const PUBLISHED_TODAY_SQL = `select count(*)::int as n
  from loop_autopilot_log a
  join workspaces w on w.id = a.workspace_id
 where a.workspace_id = $1
   and a.decision in ('announced', 'dispatched')
   and (a.created_at at time zone coalesce(w.timezone, 'UTC'))::date
       = (now() at time zone coalesce(w.timezone, 'UTC'))::date`

/**
 * The two settings and the dial, in one round trip.
 *
 * LEFT JOIN on `loop_settings`, because a workspace that never opened the Loop
 * has no row there and the answer for it is "autopilot is off", not an error.
 * The column defaults live in the migration and are NOT repeated here: a
 * default written twice is two defaults, and they drift.
 *
 * Parameters: $1 workspace_id.
 */
export const AUTOPILOT_SETTINGS_SQL = `select s.autopilot_daily_cap,
       s.autopilot_cancel_minutes,
       s.weekly_budget_credits
  from workspaces w
  left join loop_settings s on s.workspace_id = w.id
 where w.id = $1`

/** The dial, every channel the customer has ever set. Parameters: $1 workspace_id. */
export const DIAL_SQL = `select channel, level
  from loop_channel_autonomy
 where workspace_id = $1`

/**
 * Write one decision.
 *
 * ── WHY EVERY COLUMN IS NAMED AND NOTHING DEFAULTS SILENTLY ──────────────────
 * `ops_audit_log` holds 17,556 rows of which 96.3% name nothing they acted on,
 * and it got that way because `target_id` had a default of `''`. Here the four
 * identifying columns are NOT NULL with a CHECK, so an incomplete row is
 * refused by the database rather than accepted and forgotten.
 *
 * Parameters: $1 workspace_id, $2 post_id, $3 variant_id, $4 channel,
 * $5 account_id, $6 brief_id, $7 cycle_id, $8 decision, $9 refusal_reason,
 * $10 dispatch_after.
 */
export const WRITE_DECISION_SQL = `insert into loop_autopilot_log
       (workspace_id, post_id, variant_id, channel, account_id,
        brief_id, cycle_id, decision, refusal_reason, dispatch_after)
values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
returning id`
