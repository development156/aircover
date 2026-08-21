-- ─────────────────────────────────────────────────────────────────────────────
-- M2 · The Loop — the kill switch was missing the posts that matter most
-- ─────────────────────────────────────────────────────────────────────────────
--
-- ── THE DEFECT, AND HOW IT WAS FOUND ────────────────────────────────────────
-- 20260820000400's `loop_kill_switch` scoped the posts it unscheduled through
--
--     ... join loop_cycles c ... where c.status = 'cancelled'
--
-- — that is, ONLY the posts of cycles it had just cancelled in the same call.
-- Its cancel step deliberately skips cycles already in 'reported', because
-- cancelling a finished week would rewrite history. Both halves are individually
-- defensible and together they leave a hole:
--
--     A CYCLE THAT FINISHED ITS ORCHESTRATION KEEPS ITS SCHEDULED POSTS,
--     AND THE KILL SWITCH WALKS PAST THEM.
--
-- 'reported' means the cycle finished PLANNING AND WRITING. It says nothing
-- about whether those posts have gone out — they sit on the calendar waiting for
-- their slot, which is days away by design. So the single most likely reason
-- anybody presses this button ("the Loop planned my week and I want it stopped")
-- is the exact case the first version did nothing about.
--
-- Found by running a real cycle to completion and then querying which rows still
-- satisfied the dispatcher's gate. Four did. The unit tests all passed, because
-- every one of them cancelled a LIVE cycle — the fixture and the defect had the
-- same blind spot, which is how a guard comes to share a flaw with the thing it
-- guards.
--
-- ── THE FIX ─────────────────────────────────────────────────────────────────
-- Cancelling a CYCLE and unscheduling its POSTS are two different actions and
-- are now scoped separately. Cycles: only live ones, unchanged — history stays
-- intact. Posts: every post this workspace's Loop scheduled, whatever state its
-- cycle is in, because a scheduled post is a scheduled post.
--
-- Still scoped through `loop_briefs`, NOT `posts.origin` — origin cannot tell a
-- Loop post from one made by clicking "Plan my week" on Home, and cancelling the
-- second kind would destroy work nobody asked this to touch.
--
-- IF THIS FILE IS WRONG: the kill switch either misses posts (the bug being
-- fixed) or reaches posts it should not. The second is the dangerous direction
-- and is what the brief link and the workspace scoping prevent.
--
-- REVERSIBLE: yes — re-apply the previous body from 20260820000400. Nothing
-- stored changes shape; this replaces one function.
--
-- APPLY ORDER: after 20260820000400_loop_rpcs.sql.

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

  -- 2) EVERY POST THIS WORKSPACE'S LOOP PUT ON THE CALENDAR comes off it,
  --    WHATEVER STATE ITS CYCLE IS IN. This is the fix: no join to
  --    loop_cycles.status at all. A post scheduled by a reported cycle is
  --    still a scheduled Loop post, and it is the commonest thing anybody
  --    presses this button to stop.
  --
  --    Scoped through loop_briefs, so a post the CUSTOMER scheduled by hand —
  --    which carries the same `origin` — is never touched.
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
       -- Only what is actually going somewhere. A published post is past
       -- recall and must not be rewritten to look like a draft; an expired or
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
