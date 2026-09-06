-- ─────────────────────────────────────────────────────────────────────────────
-- M2 · The Loop — the kill switch left L2 review posts live on the queue
-- ─────────────────────────────────────────────────────────────────────────────
--
-- ── THE DEFECT ───────────────────────────────────────────────────────────────
-- `loop_kill_switch` (20260820000400, corrected in 20260820000600) unschedules
-- the posts its cycles created, but its post filter is:
--
--     and p.status in ('approved', 'scheduled')
--
-- those are exactly `DISPATCHABLE_STATUSES` (packages/shared) — the two the
-- dispatcher acts on. But a post the Loop wrote at autonomy L2 does NOT land in
-- either. L2 is "approve-to-publish": the create stage writes the post at
-- status = 'review' and drops it on the APPROVALS QUEUE for a person. It is not
-- dispatchable yet — and that is precisely why leaving it is a hole. One click
-- of Approve turns a 'review' post into an 'approved'/'scheduled' one and it goes
-- out. So the kill switch, whose entire promise is "nothing this cycle planned
-- will reach anyone", walked past the posts a single human tap would send.
--
-- This is a DIFFERENT argument from the one the old comment makes. The old
-- comment justified the two-status filter by the dispatcher gate ("only what is
-- actually going somewhere"); by that test 'review' does not belong, because a
-- review post is going nowhere on its own. The correct test is not "is it
-- dispatchable now" but "does stopping the Loop mean it will not go out" — and a
-- post sitting on the approvals queue fails that test, because the queue is the
-- one step from which it still can.
--
-- ── THE FIX ──────────────────────────────────────────────────────────────────
-- Add 'review' to the post-status set the unschedule step matches. A review post
-- is returned to 'draft' with scheduled_at cleared, exactly like an approved or
-- scheduled one: the writing survives in the Planner, it simply leaves the
-- approvals queue. Nothing further-along is added — 'published', 'partial',
-- 'publishing', 'failed', 'expired' stay untouched, because those are past recall
-- and rewriting them would make our record lie about what went out. 'idea' and
-- 'draft' are already-at-rest and need no change.
--
-- Still scoped through `loop_briefs`, so a post the customer put in review BY
-- HAND is never touched: only posts THIS workspace's Loop created carry a brief
-- link. And still whatever-state-its-cycle-is-in, keeping 20260820000600's fix
-- for reported cycles.
--
-- The returned `posts_unscheduled` key is unchanged — callers read it — and now
-- counts the review posts it reclaims as well.
--
-- IF THIS IS WRONG: the switch either still misses review posts (the bug) or, in
-- the dangerous direction, reaches a post it should not — prevented, as before,
-- by the brief link and the workspace scoping.
--
-- REVERSIBLE: yes — re-apply the body from 20260820000600. One function changes.
--
-- APPLY ORDER: after 20260820000600_loop_kill_switch_reported.sql.

create or replace function public.loop_kill_switch(
  p_workspace_id uuid,
  p_also_pause   boolean default true
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
  v_cycles   int := 0;
  v_briefs   int := 0;
  v_posts    int := 0;
  v_variants int := 0;
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

  perform pg_advisory_xact_lock(hashtextextended('loop_cycle:' || v_ws::text, 0));

  -- 1) Every LIVE cycle stops. 'reported' is still excluded — a finished week
  --    keeps its record, and this step is about stopping work in progress.
  with killed as (
    update loop_cycles
       set status = 'cancelled',
           failure_reason = coalesce(failure_reason, 'KILL_SWITCH')
     where workspace_id = v_ws
       and status not in ('reported', 'cancelled', 'failed')
    returning id
  )
  select count(*) into v_cycles from killed;

  -- 2) EVERY POST THIS WORKSPACE'S LOOP PUT ON THE CALENDAR OR THE APPROVALS
  --    QUEUE comes off it, WHATEVER STATE ITS CYCLE IS IN.
  --
  --    'review' joins 'approved'/'scheduled' here (added 20260906200100): an L2
  --    post is written at status='review' and sits on the approvals queue, one
  --    human tap from going out. Stopping the Loop must reclaim it too, or the
  --    switch's promise — nothing this cycle planned reaches anyone — is broken
  --    for exactly the posts a person is about to approve. It returns to 'draft'
  --    with scheduled_at cleared, so the writing survives in the Planner.
  --
  --    Scoped through loop_briefs, so a post the CUSTOMER put in review by hand —
  --    same `origin` — is never touched. Statuses past recall
  --    ('publishing','published','partial','failed','expired') are left as they
  --    are: rewriting them would make our record disagree with what went out.
  with targets as (
    select distinct b.post_id
      from loop_briefs b
     where b.workspace_id = v_ws
       and b.post_id is not null
  ),
  unscheduled as (
    update posts p
       set status = 'draft', scheduled_at = null
     where p.workspace_id = v_ws
       and p.id in (select post_id from targets)
       and p.status in ('review', 'approved', 'scheduled')
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
         select distinct b.post_id from loop_briefs b
          where b.workspace_id = v_ws and b.post_id is not null
       )
    returning v.id
  )
  select count(*) into v_variants from vt;

  -- 4) The briefs of CANCELLED cycles record that they were stopped rather
  --    than made. Deliberately still scoped to cancelled cycles: a reported
  --    cycle's brief was genuinely drafted, and rewriting its outcome to
  --    'skipped' would make the CMO Report for that week describe work that
  --    did happen as work that did not.
  with bs as (
    update loop_briefs b
       set stage_outcome = 'skipped'
      from loop_cycles c
     where c.id = b.cycle_id
       and c.workspace_id = b.workspace_id
       and b.workspace_id = v_ws
       and c.status = 'cancelled'
       and b.stage_outcome in ('planned', 'awaiting_approval')
    returning b.id
  )
  select count(*) into v_briefs from bs;

  -- 5) Outstanding holds — READ ONLY. The caller releases them through
  --    app.apply_ledger_entry; putting a ledger write in this transaction
  --    would mean a fault in either half rolls back both, and of the two the
  --    cancellation is the one that must survive.
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
     and h.object_ref like 'loop:%'
     and not exists (select 1 from credit_ledger s where s.settles_entry_id = h.id);

  if p_also_pause then
    insert into loop_settings (workspace_id, paused)
    values (v_ws, true)
    on conflict (workspace_id) do update set paused = true;
  end if;

  return jsonb_build_object(
    'cycles_cancelled', v_cycles,
    'briefs_skipped', v_briefs,
    'posts_unscheduled', v_posts,
    'variants_unscheduled', v_variants,
    'paused', p_also_pause,
    'outstanding_holds', v_holds
  );
end;
$$;

revoke execute on function public.loop_kill_switch(uuid, boolean) from public, anon;
grant  execute on function public.loop_kill_switch(uuid, boolean) to authenticated, service_role;
