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

/**
 * The posts autopilot may CONSIDER: one row per variant the Loop planned, on a
 * channel the customer armed to level 3, that has not gone out.
 *
 * ── SCOPED THROUGH loop_briefs, NEVER THROUGH posts.origin ───────────────────
 * The rule this schema already follows in two places, both of which say why:
 * `20260820000400_loop_rpcs.sql` and the kill switch in
 * `20260820000600_loop_kill_switch_reported.sql`. `origin` is one text column
 * that can only record where a post came from LAST, so it cannot tell a Loop
 * post from a hand-written one once anything else has touched it. `loop_briefs`
 * carries a real link, guarded by a tenancy trigger, and there is a partial
 * index for exactly this read (`loop_briefs_linked_posts`).
 *
 * Reading `origin` instead would be worse than untidy here: it would let
 * autopilot publish a post the Loop never planned, in a customer's voice, with
 * nobody watching.
 *
 * ── WHY THE DIAL IS JOINED RATHER THAN FILTERED IN CODE ──────────────────────
 * An INNER join on `level = 3` means a channel nobody armed produces NO ROW at
 * all, so it cannot reach `decideOne` and be mis-defaulted on the way. The code
 * refuses `undefined` by name as well; this is the half that makes that refusal
 * hard to reach rather than the half that reports it.
 *
 * ── THE ACCOUNT IS JOINED ON THE SAME TERMS THE ASSERTION USES ───────────────
 * `assert_account_for_scheduled_post` accepts an account only when there is an
 * ACTIVE connection on the SAME channel as the variant whose
 * `external_account ->> 'id'` matches and whose `profileId` matches the
 * workspace's `zernio_profiles.profile_id`. This join mirrors all four, so the
 * `account_id` this scan returns is one that function would accept.
 *
 * Two reasons it is a join and not a later lookup. A channel armed at L3 with
 * no active connection then produces NO ROW, which is the same treatment an
 * unarmed channel gets and for the same reason — it never reaches a decision to
 * be mis-defaulted. And `loop_autopilot_log.account_id` is NOT NULL with a
 * non-empty CHECK, so a row that could not name its account could not be
 * written anyway; failing to produce the candidate is better than producing one
 * that the log will refuse.
 *
 * MIRRORING IS NOT ENFORCING. The publish path still calls the assertion, which
 * is the guard that actually holds and is verified against production with five
 * hostile calls. This join only stops autopilot considering work it could never
 * complete.
 *
 * ── AND WHY publish_status IS CHECKED HERE ───────────────────────────────────
 * `pending` and `scheduled` are the two states a variant can be in before it
 * goes out. `published`, `publishing`, `failed` and `skipped` are each a reason
 * not to consider it, and the most important is `publishing`: that variant is
 * in flight right now, and picking it up would publish it twice.
 *
 * Parameters: $1 workspace_id, $2 row limit.
 */
export const AUTOPILOT_CANDIDATES_SQL = `select p.id            as post_id,
       v.id            as variant_id,
       v.channel       as channel,
       v.body          as body,
       v.last_error    as last_error,
       b.id            as brief_id,
       b.cycle_id      as cycle_id,
       c.external_account ->> 'id' as account_id
  from loop_briefs b
  join posts p
    on p.id = b.post_id
   and p.workspace_id = b.workspace_id
  join post_variants v
    on v.post_id = p.id
   and v.workspace_id = p.workspace_id
  join loop_channel_autonomy d
    on d.workspace_id = b.workspace_id
   and d.channel = v.channel
   and d.level = 3
  join zernio_profiles z
    on z.workspace_id = b.workspace_id
  join connections c
    on c.workspace_id = b.workspace_id
   and c.platform = v.channel
   and c.status = 'active'
   and c.external_account ->> 'profileId' = z.profile_id
 where b.workspace_id = $1
   and b.post_id is not null
   and b.included
   and v.publish_status in ('pending', 'scheduled')
   and not exists (
     select 1 from loop_autopilot_log a
      where a.workspace_id = b.workspace_id
        and a.post_id = p.id
        and a.variant_id = v.id
   )
 order by b.priority asc, v.created_at asc
 limit $2`

/**
 * DISPATCH — hand the post to the publish path that already exists.
 *
 * ── AUTOPILOT DOES NOT PUBLISH. IT SCHEDULES. ────────────────────────────────
 * This is the most important design decision in the dispatcher and it belongs
 * in writing. The obvious shape is for autopilot to call the adapter itself.
 * That would mean a SECOND publish path, and the first one already runs, in
 * order: Constraint Engine, then the refusal gate, then
 * `assert_account_for_scheduled_post`, then the adapter. Every one of those is
 * proven, and the account assertion is verified against production with five
 * hostile calls.
 *
 * A second path would inherit none of it. It would be the code with nobody
 * watching, which is precisely the code that must reuse the guards rather than
 * re-implement them.
 *
 * So "dispatched" means: the post becomes `scheduled` with a `scheduled_at` of
 * now, and the existing sweep picks it up on its next tick exactly as it would
 * a post a person scheduled by hand. `isDispatchable` is the one definition of
 * eligibility in this product and it admits `approved` and `scheduled` with a
 * real time; this writes both halves.
 *
 * ── AND THE KILL SWITCH STILL REACHES IT ─────────────────────────────────────
 * The kill switch cancels scheduled posts scoped through `loop_briefs`, and an
 * autopilot candidate is by definition linked to a brief — the candidate scan
 * joins through one. So a post armed here is cancellable by the same switch
 * that cancels everything else the Loop scheduled, with no new code.
 *
 * ── THE GUARD IN THE WHERE CLAUSE ────────────────────────────────────────────
 * `status in ('idea','draft','review','approved')` refuses to re-arm anything
 * already in flight or finished. `publishing` is the one that matters: that
 * post is being sent right now, and moving it back to `scheduled` would put it
 * in front of the sweep a second time and publish it twice. The statement
 * returns the id, so a caller can tell a real arming from a refused one rather
 * than assuming it worked.
 *
 * Parameters: $1 workspace_id, $2 post_id.
 */
export const ARM_FOR_PUBLISH_SQL = `update posts
   set status = 'scheduled',
       scheduled_at = now(),
       updated_at = now()
 where id = $2
   and workspace_id = $1
   and status in ('idea', 'draft', 'review', 'approved')
returning id`

/**
 * The ACTIVE Brand Brain payload, or no row.
 *
 * ── WHY THE DIAL BEING AT 3 IS NOT ENOUGH ────────────────────────────────────
 * The trigger in `20260828120000_loop_autopilot_l3.sql` refuses an L3 write
 * unless the four named fields are confirmed, so a channel can only have
 * REACHED 3 with a brain that cleared the floor. That is a fact about the past.
 *
 * A person can unconfirm a field afterwards and the dial does not move. The
 * floor has to be re-read at decision time or autopilot keeps publishing on an
 * agreement somebody has since withdrawn — and withdrawing it is exactly how a
 * customer says "stop writing that about us".
 *
 * `status = 'active'` and nothing else: a superseded version describes the
 * business the way it was described before somebody corrected it.
 *
 * Parameters: $1 workspace_id.
 */
export const ACTIVE_BRAIN_SQL = `select payload
  from brand_memory
 where workspace_id = $1
   and status = 'active'
 limit 1`

/**
 * STOP ONE ANNOUNCED POST — the tap that makes autopilot humane.
 *
 * ── A CANCELLATION IS A NEW ROW, NEVER AN EDIT ───────────────────────────────
 * `loop_autopilot_log` refuses UPDATE and DELETE even to service_role. That is
 * not an obstacle to work around here, it is the design: the fact that a post
 * WAS going out at 09:00 stays true after somebody stops it, and an audit trail
 * that rewrites its own history is not one.
 *
 * ── WHY INSERT ... SELECT AND NOT A READ THEN A WRITE ────────────────────────
 * Two statements race the dispatcher. Between "is it still pending?" and
 * "write cancelled", the tick can dispatch it — and the cancellation would then
 * be recorded against a post that has already gone out, which is a lie in the
 * one table that exists not to tell them.
 *
 * One statement closes that. The SELECT re-derives the announcement and the
 * NOT EXISTS re-checks for a terminal row, both inside the same statement as
 * the INSERT, so a dispatch that lands first means zero rows written and the
 * caller is told the cancel did not take.
 *
 * It also copies the identifiers FROM the announcement rather than taking them
 * from the caller. A cancel row that named a different account or channel from
 * the announcement it cancels would be unreadable as a pair, and this makes
 * that impossible rather than merely unlikely.
 *
 * ── THE WINDOW IS NOT CHECKED, DELIBERATELY ──────────────────────────────────
 * A post whose window closed but which the sweep has not reached yet has still
 * not gone out, and refusing to stop it would be refusing a remedy that would
 * have worked. What ends the ability to cancel is a `dispatched` row, not a
 * clock.
 *
 * Parameters: $1 workspace_id, $2 post_id, $3 variant_id.
 */
export const CANCEL_ANNOUNCEMENT_SQL = `insert into loop_autopilot_log
       (workspace_id, post_id, variant_id, channel, account_id,
        brief_id, cycle_id, decision, actor)
select a.workspace_id, a.post_id, a.variant_id, a.channel, a.account_id,
       a.brief_id, a.cycle_id, 'cancelled', 'person'
  from loop_autopilot_log a
 where a.workspace_id = $1
   and a.post_id = $2
   and a.variant_id = $3
   and a.decision = 'announced'
   and not exists (
     select 1 from loop_autopilot_log later
      where later.workspace_id = a.workspace_id
        and later.post_id = a.post_id
        and later.variant_id = a.variant_id
        and later.decision in ('dispatched', 'cancelled')
        and later.created_at >= a.created_at
   )
 order by a.created_at desc
 limit 1
returning id`
