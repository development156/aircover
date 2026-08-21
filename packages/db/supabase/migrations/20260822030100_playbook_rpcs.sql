-- ─────────────────────────────────────────────────────────────────────────────
-- M10 · PLAYBOOKS — the two functions a person reaches
-- ─────────────────────────────────────────────────────────────────────────────
--
-- `playbook_approve_cost` is the gate between a proposal and a bill.
-- `playbook_kill_switch` is the brake.
--
-- Both are SECURITY DEFINER and both derive identity from the JWT rather than
-- from an argument, so a caller cannot act as someone else by passing a
-- different id. Both check membership and role themselves, because a definer
-- function bypasses the row policies that would otherwise do it.
--
-- IF THIS FILE IS WRONG: a proposal cannot be approved (nothing is charged and
-- nothing is written — the safe direction), or the kill switch reaches too far
-- or not far enough. The second is the dangerous one and section 2 is where it
-- is guarded.
--
-- REVERSIBLE: yes, drop both functions. Nothing stored changes shape.
--
-- APPLY ORDER: after 20260822030000_playbooks.sql.


-- ── 1 of 2 ───────────────────────────────────────────────────────────────────
-- APPROVE THE COST PREVIEW.
--
-- Until this has run, the run sits at `awaiting_cost_approval` and the executor
-- refuses to move. Nothing has been charged at that point — not the per-run fee
-- and not a single item — because a Playbook's proposal step reads a calendar
-- rather than calling a model, so there is no honest reason to take money before
-- the number has been seen.
--
-- ── THE TRIM HAPPENS HERE, IN THE SAME STATEMENT AS THE APPROVAL ────────────
-- If trimming were its own call, a person could trim, walk away, and a second tab
-- could approve the untrimmed total — approving a number that was on screen a
-- minute ago is exactly the surprise this mechanism exists to prevent.
-- `p_expected_credits` closes the same door from the other side: the caller
-- states the total it showed, and if the recomputed total is not that number,
-- nothing is approved.
--
-- ── A ZERO TOTAL IS APPROVABLE, AND THAT IS NOT AN OVERSIGHT ────────────────
-- At L0 every item is a suggestion, no model is called, and the correct total is
-- the per-run charge alone. `NOTHING_INCLUDED` refuses a run with no items left,
-- which is "cancel" wearing the word "approve"; it does not refuse a run whose
-- items legitimately price at zero.
--
-- Errors: AUTH_REQUIRED · INVALID_RUN · NOT_A_MEMBER · FORBIDDEN_ROLE ·
--         WRONG_STATUS · NOTHING_INCLUDED · ESTIMATE_CHANGED
-- Returns: { run_id, approved_credits, included_items, excluded_items, replayed }
--   `replayed: true` is a SUCCESS — a second click on the same approval.
create or replace function public.playbook_approve_cost(
  p_run_id           uuid,
  p_excluded_items   uuid[] default '{}',
  p_expected_credits int default null
) returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_user     text;
  v_run      playbook_runs%rowtype;
  v_role     text;
  v_total    int;
  v_included int;
  v_excluded int;
begin
  -- 1) identity from the JWT, never from an argument
  v_user := auth.jwt() ->> 'sub';
  if v_user is null or v_user = '' then
    raise exception 'AUTH_REQUIRED' using errcode = 'raise_exception';
  end if;
  if p_run_id is null then
    raise exception 'INVALID_RUN' using errcode = 'raise_exception';
  end if;

  -- 2) serialize before reading. Two tabs approving at once must not both pass
  --    the status check and both write.
  perform pg_advisory_xact_lock(hashtextextended('playbook_approve:' || p_run_id::text, 0));

  select * into v_run from playbook_runs where id = p_run_id;
  if not found then
    -- Same error as a run in another tenant, deliberately: a distinct
    -- "exists but not yours" would let a stranger enumerate run ids.
    raise exception 'INVALID_RUN' using errcode = 'raise_exception';
  end if;

  -- 3) membership + role. Approving a cost is spending money, so a viewer may not.
  select m.role into v_role from workspace_members m
   where m.workspace_id = v_run.workspace_id and m.user_id = v_user;
  if not found then
    raise exception 'NOT_A_MEMBER' using errcode = 'raise_exception';
  end if;
  if v_role not in ('owner', 'editor', 'approver') then
    raise exception 'FORBIDDEN_ROLE' using errcode = 'raise_exception';
  end if;

  -- 4) idempotency BEFORE the status check. A double click, or a retry after a
  --    lost response, must read as success — if it raised WRONG_STATUS the
  --    customer would be told their approval failed when it had already worked,
  --    and the obvious next move is to press it again.
  if v_run.cost_approved_at is not null then
    select count(*) filter (where included),
           count(*) filter (where not included)
      into v_included, v_excluded
      from playbook_run_items where run_id = v_run.id;
    return jsonb_build_object(
      'run_id', v_run.id,
      'approved_credits', v_run.approved_credits,
      'included_items', v_included,
      'excluded_items', v_excluded,
      'replayed', true
    );
  end if;

  if v_run.status is distinct from 'awaiting_cost_approval' then
    raise exception 'WRONG_STATUS' using errcode = 'raise_exception';
  end if;

  -- 5) apply the trim. Scoped to this run, so an id from another run in the array
  --    simply matches nothing rather than reaching across.
  update playbook_run_items
     set included = not (id = any(coalesce(p_excluded_items, '{}'::uuid[]))),
         outcome = case
           when id = any(coalesce(p_excluded_items, '{}'::uuid[])) then 'skipped'
           else outcome
         end
   where run_id = v_run.id;

  -- 6) recompute the total FROM THE ROWS, never from an argument. The number
  --    being approved is derived from what is actually about to be made.
  select coalesce(sum(estimated_credits), 0), count(*)
    into v_total, v_included
    from playbook_run_items where run_id = v_run.id and included;

  if v_included = 0 then
    raise exception 'NOTHING_INCLUDED' using errcode = 'raise_exception';
  end if;

  -- 7) the caller's total must match what the rows say. This is what makes the
  --    preview a contract rather than a picture.
  if p_expected_credits is not null and p_expected_credits is distinct from v_total then
    raise exception 'ESTIMATE_CHANGED' using errcode = 'raise_exception';
  end if;

  select count(*) into v_excluded from playbook_run_items where run_id = v_run.id and not included;

  -- The status stays at `awaiting_cost_approval`. The executor is what moves it
  -- to `running`, and it does so only after re-reading `cost_approved_at` from
  -- this table — so the gate is a fresh read of the row about to be spent
  -- against, never a belief inherited from this call.
  update playbook_runs
     set cost_approved_at = now(),
         cost_approved_by = v_user,
         approved_credits = v_total
   where id = v_run.id;

  return jsonb_build_object(
    'run_id', v_run.id,
    'approved_credits', v_total,
    'included_items', v_included,
    'excluded_items', v_excluded,
    'replayed', false
  );
end;
$$;

revoke execute on function public.playbook_approve_cost(uuid, uuid[], int) from public, anon;
grant  execute on function public.playbook_approve_cost(uuid, uuid[], int) to authenticated, service_role;


-- ── 2 of 2 ───────────────────────────────────────────────────────────────────
-- THE KILL SWITCH. Stop every playbook in this workspace and take everything
-- they put on the calendar back off it.
--
-- ── THE SCOPE IS `playbook_run_items`, NEVER `posts.origin` ─────────────────
-- This is the single most important line in the file and it is the lesson the
-- Loop learned the expensive way. `origin = 'playbook'` is a LABEL saying who
-- drafted a post; it is not a claim that a playbook run still owns it. A post
-- can carry that label with no item pointing at it — a draft the customer
-- adopted, edited and scheduled themselves — and destroying that person's work
-- because of a column that describes its authorship would be the worst thing
-- this button could do.
--
-- `kill-switch.pglite.test.ts` plants exactly that row as a CONTROL THAT MUST
-- SURVIVE, and the mutation that scopes by origin is what turns it red.
--
-- ── CANCELLING A RUN AND UNSCHEDULING ITS POSTS ARE TWO DIFFERENT SCOPES ────
-- Runs: only live ones. A completed run's record stays intact, because rewriting
-- a finished run to 'cancelled' would make the history describe work that did
-- happen as work that did not.
--
-- Posts: EVERY post this workspace's playbooks scheduled, whatever state its run
-- is in. That asymmetry is deliberate and it is the Loop's actual defect, which
-- was found by running a cycle to completion and then querying which rows still
-- satisfied the dispatcher's gate. 'completed' means the run finished WRITING.
-- It says nothing about whether those posts have gone out — they sit on the
-- calendar waiting for a slot that is days away by design, which is the single
-- most likely reason anybody presses this button.
--
-- ── WHAT IT DOES NOT DO: MOVE MONEY ─────────────────────────────────────────
-- Outstanding holds are REPORTED, not released. A ledger write in this
-- transaction would mean a fault in either half rolls back both, and of the two
-- the cancellation is the one that must survive. The caller releases them
-- through app.apply_ledger_entry.
--
-- Errors: AUTH_REQUIRED · INVALID_WORKSPACE · NOT_A_MEMBER · FORBIDDEN_ROLE
create or replace function public.playbook_kill_switch(
  p_workspace_id  uuid,
  p_also_disable  boolean default true
) returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_user     text;
  v_role     text;
  v_ws       uuid;
  v_runs     int := 0;
  v_items    int := 0;
  v_posts    int := 0;
  v_variants int := 0;
  v_disabled int := 0;
  v_holds    jsonb;
begin
  v_user := auth.jwt() ->> 'sub';
  if v_user is null or v_user = '' then
    raise exception 'AUTH_REQUIRED' using errcode = 'raise_exception';
  end if;
  if p_workspace_id is null then
    raise exception 'INVALID_WORKSPACE' using errcode = 'raise_exception';
  end if;

  select m.workspace_id, m.role into v_ws, v_role
    from workspace_members m
   where m.workspace_id = p_workspace_id and m.user_id = v_user;
  if not found then
    raise exception 'NOT_A_MEMBER' using errcode = 'raise_exception';
  end if;
  if v_role not in ('owner', 'editor', 'approver') then
    raise exception 'FORBIDDEN_ROLE' using errcode = 'raise_exception';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('playbook_kill:' || v_ws::text, 0));

  -- 1) Every LIVE run stops. The endings are left alone — a finished run keeps
  --    its record, and this step is about stopping work in progress.
  with killed as (
    update playbook_runs
       set status = 'cancelled',
           failure_reason = coalesce(failure_reason, 'KILL_SWITCH'),
           finished_at = coalesce(finished_at, now())
     where workspace_id = v_ws
       and status in ('proposing', 'awaiting_cost_approval', 'running')
    returning id
  )
  select count(*) into v_runs from killed;

  -- 2) EVERY POST THIS WORKSPACE'S PLAYBOOKS PUT ON THE CALENDAR comes off it,
  --    WHATEVER STATE ITS RUN IS IN. No join to playbook_runs.status at all.
  --
  --    Scoped through playbook_run_items, so a post carrying `origin =
  --    'playbook'` that no item points at is never touched.
  with targets as (
    select distinct i.post_id
      from playbook_run_items i
     where i.workspace_id = v_ws
       and i.post_id is not null
  ),
  unscheduled as (
    update posts p
       set status = 'draft', scheduled_at = null
     where p.workspace_id = v_ws
       and p.id in (select post_id from targets)
       -- Only what is actually going somewhere. A published post is past recall
       -- and must not be rewritten to look like a draft; an expired or
       -- already-draft post needs no change and should not bump updated_at.
       and p.status in ('approved', 'scheduled')
    returning p.id
  )
  select count(*) into v_posts from unscheduled;

  -- 3) The per-channel variants of those posts stop being scheduled too.
  with vt as (
    update post_variants v
       set publish_status = 'pending'
     where v.workspace_id = v_ws
       and v.publish_status = 'scheduled'
       and v.post_id in (
         select distinct i.post_id from playbook_run_items i
          where i.workspace_id = v_ws and i.post_id is not null
       )
    returning v.id
  )
  select count(*) into v_variants from vt;

  -- 4) The items of CANCELLED runs record that they were stopped rather than
  --    made. Deliberately scoped to cancelled runs: a completed run's item was
  --    genuinely drafted, and rewriting its outcome to 'skipped' would make the
  --    history describe work that did happen as work that did not.
  with its as (
    update playbook_run_items i
       set outcome = 'skipped'
      from playbook_runs r
     where r.id = i.run_id
       and r.workspace_id = i.workspace_id
       and i.workspace_id = v_ws
       and r.status = 'cancelled'
       and i.outcome in ('proposed', 'awaiting_approval')
    returning i.id
  )
  select count(*) into v_items from its;

  -- 5) Outstanding holds — READ ONLY. See the header.
  select coalesce(jsonb_agg(jsonb_build_object(
           'entry_id', h.id,
           'action_type', h.action_type,
           'amount', h.amount,
           'object_ref', h.object_ref
         )), '[]'::jsonb)
    into v_holds
    from credit_ledger h
   where h.workspace_id = v_ws
     and h.entry_type = 'HOLD'
     and h.object_ref like 'playbook:%'
     and not exists (select 1 from credit_ledger s where s.settles_entry_id = h.id);

  -- 6) And, by default, nothing starts again on its own. A kill switch that
  --    stopped today's runs and left the schedule armed would fire again
  --    tomorrow, which is not what anybody means by the word.
  if p_also_disable then
    with d as (
      update playbooks set enabled = false
       where workspace_id = v_ws and enabled
      returning id
    )
    select count(*) into v_disabled from d;
  end if;

  return jsonb_build_object(
    'runs_cancelled', v_runs,
    'items_skipped', v_items,
    'posts_unscheduled', v_posts,
    'variants_unscheduled', v_variants,
    'playbooks_disabled', v_disabled,
    'outstanding_holds', v_holds
  );
end;
$$;

revoke execute on function public.playbook_kill_switch(uuid, boolean) from public, anon;
grant  execute on function public.playbook_kill_switch(uuid, boolean) to authenticated, service_role;
