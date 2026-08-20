-- ─────────────────────────────────────────────────────────────────────────────
-- M2 · The Loop — the three things a PERSON does to a running cycle
-- ─────────────────────────────────────────────────────────────────────────────
--
-- WHAT THIS IS. `loop_cycles`, `loop_briefs` and `memory_events` are read-only to
-- members: the orchestrator writes them over an owner connection with no JWT, and
-- a customer must not be able to edit the record of what they were charged for.
-- But three things ARE the customer's to do, and each needs a way in:
--
--   1. loop_approve_cost      approve the preview (and trim it first)
--   2. loop_kill_switch       cancel everything the Loop has scheduled
--   3. resolve_memory_event   accept or reject a proposed learning
--
-- Each is one function that does one thing, takes identity from the JWT rather
-- than from an argument, and checks membership itself. That is the same shape as
-- `public.resolve_brand_memory` (20260719094548) and for the same reason: a
-- SECURITY DEFINER function is a hole in RLS, so the narrower each one is, the
-- less there is to get wrong.
--
-- IF THIS FILE IS WRONG: the Loop screen's three buttons stop working. No
-- existing table is altered and no existing function is replaced —
-- `app.jsonb_deep_merge` is new, and the three public functions are new names.
--
-- REVERSIBLE: yes, drop the four functions. Nothing stored depends on them.
--
-- APPLY ORDER: after 20260820000300_loop_cycles.sql.


-- ── 1 of 5 ───────────────────────────────────────────────────────────────────
-- Recursive JSON merge, needed by `resolve_memory_event` to apply an accepted
-- learning to the Brand Brain.
--
-- Postgres's own `||` merges only the TOP level: `{"voice":{"a":1}} ||
-- {"voice":{"b":2}}` gives `{"voice":{"b":2}}` and silently discards `a`. Applied
-- to a brand payload, a learning that touched one field of `voice` would erase
-- every other field of `voice`. That is a data-loss bug wearing the costume of an
-- operator, so the merge is written out.
--
-- Objects merge key by key; everything else — scalars, and ARRAYS — replaces. An
-- array replacing wholesale is the correct choice and not a shortcut: the arrays
-- in a brand payload are ordered, fixed-length lists (`signature_phrases` is
-- exactly 3, `core_values` exactly 3), so "merge" has no meaning for them and
-- appending would break the length checks `resolve_brand_memory` enforces.
--
-- An explicit JSON null in the patch replaces with null rather than deleting the
-- key, because the brand payload's shape is pinned by a zod contract and deleting
-- a key would make the brain unparseable.
create or replace function app.jsonb_deep_merge(a jsonb, b jsonb) returns jsonb
language sql
immutable
as $$
  select case
    -- Either side absent: the other one stands. Checked first so the recursion
    -- below never has to reason about nulls.
    when a is null then b
    when b is null then a
    -- Anything that is not an object on BOTH sides replaces. This is the base
    -- case and it is where arrays and scalars land.
    when jsonb_typeof(a) is distinct from 'object'
      or jsonb_typeof(b) is distinct from 'object' then b
    else (
      select coalesce(jsonb_object_agg(key, value), '{}'::jsonb)
      from (
        -- Every key on either side, merged where both have it.
        select k as key,
               case
                 when a ? k and b ? k then app.jsonb_deep_merge(a -> k, b -> k)
                 when b ? k then b -> k
                 else a -> k
               end as value
        from (
          select jsonb_object_keys(a) as k
          union
          select jsonb_object_keys(b) as k
        ) keys
      ) merged
    )
  end
$$;


-- ── 2 of 5 ───────────────────────────────────────────────────────────────────
-- APPROVE THE COST PREVIEW. The gate between a plan and a bill.
--
-- This is the most important function in the Loop. Until it has run, the cycle
-- sits at `awaiting_cost_approval` and the create stage refuses to move; after it
-- runs, the create stage may spend up to what was approved. FSD M2: the preview
-- is shown "BEFORE stage 4 runs".
--
-- The trim happens HERE, in the same statement as the approval, and not as a
-- separate call. If trimming were its own function, a person could trim, walk
-- away, and a second tab could approve the untrimmed total — approving a number
-- that was on screen a minute ago is exactly the surprise this whole mechanism
-- exists to prevent. `p_expected_credits` closes the same door from the other
-- side: the caller states the total it showed, and if the recomputed total is not
-- that number, nothing is approved.
--
-- Errors: AUTH_REQUIRED · INVALID_CYCLE · NOT_A_MEMBER · FORBIDDEN_ROLE ·
--         WRONG_STATUS · NOTHING_INCLUDED · ESTIMATE_CHANGED
-- Returns: { cycle_id, approved_credits, included_briefs, excluded_briefs, replayed }
--   `replayed: true` is a SUCCESS — a second click on the same approval.
create or replace function public.loop_approve_cost(
  p_cycle_id         uuid,
  p_excluded_briefs  uuid[] default '{}',
  p_expected_credits int default null
) returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_user     text;
  v_cycle    loop_cycles%rowtype;
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
  if p_cycle_id is null then
    raise exception 'INVALID_CYCLE' using errcode = 'raise_exception';
  end if;

  -- 2) serialize before reading. Two tabs approving at once must not both pass
  --    the status check and both write. The lock is taken on the cycle, so
  --    approvals of different cycles never queue behind each other.
  perform pg_advisory_xact_lock(hashtextextended('loop_approve:' || p_cycle_id::text, 0));

  select * into v_cycle from loop_cycles where id = p_cycle_id;
  if not found then
    -- Same error as a cycle in another tenant, deliberately: a distinct
    -- "exists but not yours" would let a stranger enumerate cycle ids.
    raise exception 'INVALID_CYCLE' using errcode = 'raise_exception';
  end if;

  -- 3) membership + role. Approving a cost is spending money, so a viewer may not.
  select m.role into v_role from workspace_members m
   where m.workspace_id = v_cycle.workspace_id and m.user_id = v_user;
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
  if v_cycle.cost_approved_at is not null then
    select count(*) filter (where included),
           count(*) filter (where not included)
      into v_included, v_excluded
      from loop_briefs where cycle_id = v_cycle.id;
    return jsonb_build_object(
      'cycle_id', v_cycle.id,
      'approved_credits', v_cycle.approved_credits,
      'included_briefs', v_included,
      'excluded_briefs', v_excluded,
      'replayed', true
    );
  end if;

  if v_cycle.status is distinct from 'awaiting_cost_approval' then
    raise exception 'WRONG_STATUS' using errcode = 'raise_exception';
  end if;

  -- 5) apply the trim. Scoped to this cycle, so an id from another cycle in the
  --    array simply matches nothing rather than reaching across.
  update loop_briefs
     set included = not (id = any(coalesce(p_excluded_briefs, '{}'::uuid[]))),
         stage_outcome = case
           when id = any(coalesce(p_excluded_briefs, '{}'::uuid[])) then 'skipped'
           else stage_outcome
         end
   where cycle_id = v_cycle.id;

  -- 6) recompute the total from the rows, never from an argument. The number
  --    being approved is derived from what is actually about to be made.
  select coalesce(sum(estimated_credits), 0), count(*)
    into v_total, v_included
    from loop_briefs where cycle_id = v_cycle.id and included;

  if v_included = 0 then
    -- Trimming everything is a coherent wish, but it is "cancel", not "approve",
    -- and it should not leave a cycle approved for zero credits that then runs a
    -- create stage over nothing.
    raise exception 'NOTHING_INCLUDED' using errcode = 'raise_exception';
  end if;

  -- 7) the caller's total must match what the rows say. This is what makes the
  --    preview a contract rather than a picture.
  if p_expected_credits is not null and p_expected_credits is distinct from v_total then
    raise exception 'ESTIMATE_CHANGED' using errcode = 'raise_exception';
  end if;

  select count(*) into v_excluded from loop_briefs where cycle_id = v_cycle.id and not included;

  update loop_cycles
     set cost_approved_at = now(),
         cost_approved_by = v_user,
         approved_credits = v_total,
         status = 'creating'
   where id = v_cycle.id;

  return jsonb_build_object(
    'cycle_id', v_cycle.id,
    'approved_credits', v_total,
    'included_briefs', v_included,
    'excluded_briefs', v_excluded,
    'replayed', false
  );
end;
$$;


-- ── 3 of 5 ───────────────────────────────────────────────────────────────────
-- THE KILL SWITCH. Cancel everything the Loop has scheduled, at once.
--
-- ── WHAT IT DOES TO A POST, AND WHY THAT AND NOT DELETION ────────────────────
-- A scheduled post is returned to `draft` with `scheduled_at` cleared. The
-- dispatcher's gate is `status IN ('approved','scheduled') AND scheduled_at IS
-- NOT NULL` (packages/shared `DISPATCHABLE_STATUSES`), so BOTH halves of that
-- condition are broken, not one. Nothing is deleted: the writing survives in the
-- Planner, and a person who pressed the kill switch to stop a bad week does not
-- also lose the work. "Cancel" here means "nothing will go out", not "nothing
-- exists".
--
-- ── WHAT IT DOES NOT DO: MOVE MONEY ──────────────────────────────────────────
-- It RETURNS the outstanding holds it found and releases none of them. Releasing
-- a hold is a ledger write, and `app.apply_ledger_entry` is the only path to one;
-- calling it from here would put a content cancellation and a money movement in
-- one transaction, where a fault in either rolls back both. The caller releases
-- each returned hold through the billing ledger port, which is the sanctioned
-- path and already idempotent.
--
-- Note honestly: in this product a hold does not normally outlive the request
-- that took it — `withCredits` holds and settles inside one invocation. The list
-- returned here is therefore usually empty, and it is NOT decoration: a create
-- stage that is mid-flight when this runs has a live hold at that instant, and
-- that is precisely the moment someone presses this button.
--
-- ── IT ALSO PAUSES, BY DEFAULT, AND SAYS SO ──────────────────────────────────
-- `p_also_pause` defaults true. FSD M2 lists pause and the kill switch as two
-- controls, and they are; but a kill switch that lets the next scheduled cycle
-- re-plan the same evening is not a kill switch, it is a delay. The caller passes
-- the value explicitly and the screen states which it is doing.
--
-- Errors: AUTH_REQUIRED · INVALID_WORKSPACE · NOT_A_MEMBER · FORBIDDEN_ROLE
-- Returns: { cycles_cancelled, briefs_skipped, posts_unscheduled, variants_unscheduled,
--            paused, outstanding_holds: [ {entry_id, action_type, amount, object_ref} ] }
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
  v_user       text;
  v_role       text;
  v_ws         uuid;
  v_cycles     int := 0;
  v_briefs     int := 0;
  v_posts      int := 0;
  v_variants   int := 0;
  v_holds      jsonb;
begin
  v_user := auth.jwt() ->> 'sub';
  if v_user is null or v_user = '' then
    raise exception 'AUTH_REQUIRED' using errcode = 'raise_exception';
  end if;
  if p_workspace_id is null then
    raise exception 'INVALID_WORKSPACE' using errcode = 'raise_exception';
  end if;

  -- Membership first, and no existence oracle: a non-member gets NOT_A_MEMBER
  -- whether or not the workspace exists. From here on v_ws only.
  select m.workspace_id, m.role into v_ws, v_role
    from workspace_members m
   where m.workspace_id = p_workspace_id and m.user_id = v_user;
  if not found then
    raise exception 'NOT_A_MEMBER' using errcode = 'raise_exception';
  end if;
  if v_role not in ('owner', 'editor', 'approver') then
    raise exception 'FORBIDDEN_ROLE' using errcode = 'raise_exception';
  end if;

  -- Serialize against the orchestrator and against a second press. Same key the
  -- cycle writer takes, so a cycle cannot advance a stage while this runs.
  perform pg_advisory_xact_lock(hashtextextended('loop_cycle:' || v_ws::text, 0));

  -- 1) Every live cycle stops. `reported` is excluded because a finished cycle
  --    has nothing left to cancel, and cancelling it would rewrite history.
  with killed as (
    update loop_cycles
       set status = 'cancelled',
           failure_reason = coalesce(failure_reason, 'KILL_SWITCH')
     where workspace_id = v_ws
       and status not in ('reported', 'cancelled', 'failed')
    returning id
  )
  select count(*) into v_cycles from killed;

  -- 2) Every post those cycles put on the calendar comes off it.
  --
  --    Scoped through `loop_briefs`, NOT through `posts.origin`. `origin` cannot
  --    tell a Loop post from one a person made by clicking "Plan my week" on Home
  --    — both are 'plan_week' — and cancelling the second kind would be this
  --    function destroying work nobody asked it to touch. The brief link names
  --    exactly the posts THIS workspace's Loop scheduled.
  with targets as (
    select distinct b.post_id
      from loop_briefs b
      join loop_cycles c on c.id = b.cycle_id and c.workspace_id = b.workspace_id
     where b.workspace_id = v_ws
       and b.post_id is not null
       and c.status = 'cancelled'
  ),
  unscheduled as (
    update posts p
       set status = 'draft', scheduled_at = null
     where p.workspace_id = v_ws
       and p.id in (select post_id from targets)
       -- Only the ones actually going somewhere. A post already published is
       -- past recall and must not be rewritten to look like a draft; a post
       -- already a draft needs no change and should not bump updated_at.
       and p.status in ('approved', 'scheduled')
    returning p.id
  )
  select count(*) into v_posts from unscheduled;

  -- 3) The per-channel variants of those posts stop being scheduled too.
  --    'pending' rather than 'skipped': the post is a draft again, and a draft's
  --    variants are pending. 'skipped' would mean "this channel was decided
  --    against", which is not what happened.
  --
  --    `publishing` and `published` are untouched on purpose — a variant already
  --    in flight is with the platform, and rewriting its row here would only make
  --    our record disagree with what actually went out.
  with vt as (
    update post_variants v
       set publish_status = 'pending'
     where v.workspace_id = v_ws
       and v.publish_status = 'scheduled'
       and v.post_id in (
         select distinct b.post_id
           from loop_briefs b
           join loop_cycles c on c.id = b.cycle_id and c.workspace_id = b.workspace_id
          where b.workspace_id = v_ws and b.post_id is not null and c.status = 'cancelled'
       )
    returning v.id
  )
  select count(*) into v_variants from vt;

  -- 4) The briefs record that they were stopped rather than made.
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

  -- 5) Outstanding holds — READ ONLY. A HOLD with nothing settling it is money
  --    reserved and not spent. Restricted to the Loop's own action types so this
  --    never reports (or invites the caller to release) a hold belonging to
  --    something a person is doing in another tab right now.
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
     and not exists (
       select 1 from credit_ledger s where s.settles_entry_id = h.id
     );

  -- 6) Pause, if asked. Upsert because a workspace that has never opened the
  --    Loop screen has no settings row, and "I pressed the kill switch" is a
  --    perfectly good moment for one to come into existence.
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


-- ── 4 of 5 ───────────────────────────────────────────────────────────────────
-- ACCEPT OR REJECT A PROPOSED LEARNING.
--
-- ── THE INVARIANT THIS FUNCTION EXISTS TO HOLD ───────────────────────────────
-- A learning is a PROPOSAL. Rejecting one must leave the Brand Brain byte-for-byte
-- unchanged — not "unchanged as far as the customer can see", but with the same
-- active row, the same version number and the same `updated_at`. The reject branch
-- below touches `memory_events` and nothing else, and there is no code path from
-- it to `brand_memory`. That is checkable by reading the branch, which is the
-- point of it being ten lines.
--
-- Accepting is the only path that writes, and it takes the SAME advisory lock key
-- `'resolve_brand:' || workspace_id` that `resolve_brand_memory` takes — that
-- function's header requires every future writer of `brand_memory` to do so, and
-- this is the first one.
--
-- The diff's `patch` is deep-merged into the current payload (section 1). The
-- merged result is NOT re-validated against the zod contract here; the RPC that
-- writes a whole brain does that, but a learning is a narrow patch and the
-- validation belongs where the patch is BUILT — in the Reflect stage, which parses
-- the model's output before it ever becomes a row. What is enforced here is the
-- shape of the diff envelope itself, so a malformed proposal cannot be accepted.
--
-- Errors: AUTH_REQUIRED · INVALID_EVENT · NOT_A_MEMBER · FORBIDDEN_ROLE ·
--         INVALID_DECISION · ALREADY_RESOLVED · INVALID_DIFF · NO_ACTIVE_BRAIN
-- Returns: { event_id, status, brand_memory_version, brand_memory_changed }
create or replace function public.resolve_memory_event(
  p_event_id uuid,
  p_decision text
) returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_user     text;
  v_role     text;
  v_event    memory_events%rowtype;
  v_cur      brand_memory%rowtype;
  v_patch    jsonb;
  v_merged   jsonb;
  v_version  int;
begin
  v_user := auth.jwt() ->> 'sub';
  if v_user is null or v_user = '' then
    raise exception 'AUTH_REQUIRED' using errcode = 'raise_exception';
  end if;
  if p_event_id is null then
    raise exception 'INVALID_EVENT' using errcode = 'raise_exception';
  end if;
  if p_decision is null or p_decision not in ('accepted', 'rejected') then
    raise exception 'INVALID_DECISION' using errcode = 'raise_exception';
  end if;

  select * into v_event from memory_events where id = p_event_id;
  if not found then
    raise exception 'INVALID_EVENT' using errcode = 'raise_exception';
  end if;

  select m.role into v_role from workspace_members m
   where m.workspace_id = v_event.workspace_id and m.user_id = v_user;
  if not found then
    raise exception 'NOT_A_MEMBER' using errcode = 'raise_exception';
  end if;
  if v_role not in ('owner', 'editor', 'approver') then
    raise exception 'FORBIDDEN_ROLE' using errcode = 'raise_exception';
  end if;

  -- Idempotent replay: the same decision twice is a success. A DIFFERENT decision
  -- on a resolved event is refused — "I rejected that" must not be quietly
  -- overturned by a stale tab, and an accepted learning cannot be un-applied by
  -- rejecting it afterwards (the version it created still exists).
  if v_event.status <> 'pending' then
    if v_event.status = p_decision then
      return jsonb_build_object(
        'event_id', v_event.id,
        'status', v_event.status,
        'brand_memory_version', v_event.applied_memory_version,
        'brand_memory_changed', false,
        'replayed', true
      );
    end if;
    raise exception 'ALREADY_RESOLVED' using errcode = 'raise_exception';
  end if;

  -- ── THE REJECT BRANCH. Ten lines, and none of them name brand_memory. ──────
  if p_decision = 'rejected' then
    update memory_events
       set status = 'rejected', resolved_at = now()
     where id = v_event.id;
    return jsonb_build_object(
      'event_id', v_event.id,
      'status', 'rejected',
      'brand_memory_version', null,
      'brand_memory_changed', false,
      'replayed', false
    );
  end if;

  -- ── THE ACCEPT BRANCH. ────────────────────────────────────────────────────
  v_patch := v_event.diff -> 'patch';
  if jsonb_typeof(v_patch) is distinct from 'object' or v_patch = '{}'::jsonb then
    raise exception 'INVALID_DIFF' using errcode = 'raise_exception';
  end if;

  -- Same key as resolve_brand_memory, so an accept and a re-resolve cannot race
  -- on max(version) or leave two active rows.
  perform pg_advisory_xact_lock(
    hashtextextended('resolve_brand:' || v_event.workspace_id::text, 0));

  select * into v_cur from brand_memory
   where workspace_id = v_event.workspace_id and status = 'active';
  if not found then
    -- Nothing to patch. Refused rather than creating a brain out of a learning:
    -- a Brand Brain is built from what a person told us in onboarding, and one
    -- assembled from an inference would be a fabrication wearing its authority.
    raise exception 'NO_ACTIVE_BRAIN' using errcode = 'raise_exception';
  end if;

  v_merged := app.jsonb_deep_merge(v_cur.payload, v_patch);

  -- A patch that changes nothing still resolves the event, but writes no new
  -- version — a version whose payload equals its parent's is noise in the
  -- history and would make the confirmation ring count a change that was not one.
  if v_merged = v_cur.payload then
    update memory_events
       set status = 'accepted', resolved_at = now(), applied_memory_version = v_cur.version
     where id = v_event.id;
    return jsonb_build_object(
      'event_id', v_event.id,
      'status', 'accepted',
      'brand_memory_version', v_cur.version,
      'brand_memory_changed', false,
      'replayed', false
    );
  end if;

  select coalesce(max(version), 0) + 1 into v_version
    from brand_memory where workspace_id = v_event.workspace_id;

  -- Supersede BEFORE insert — the reverse trips `brand_memory_one_active`.
  update brand_memory set status = 'superseded'
   where workspace_id = v_event.workspace_id and status = 'active';

  insert into brand_memory (workspace_id, version, status, payload, source, created_by)
  values (v_event.workspace_id, v_version, 'active', v_merged, 'system', v_user);

  update memory_events
     set status = 'accepted', resolved_at = now(), applied_memory_version = v_version
   where id = v_event.id;

  return jsonb_build_object(
    'event_id', v_event.id,
    'status', 'accepted',
    'brand_memory_version', v_version,
    'brand_memory_changed', true,
    'replayed', false
  );
end;
$$;


-- ── 5 of 5 ───────────────────────────────────────────────────────────────────
-- Grants. The three public functions are callable by a signed-in member — each
-- checks membership itself, so "callable" is not "usable on someone else's data".
-- `anon` is excluded: every one of them raises AUTH_REQUIRED without a JWT
-- anyway, and not granting it means the refusal happens at the door.
--
-- `app.jsonb_deep_merge` lives in the `app` schema, which PostgREST does not
-- expose, so it is unreachable as an RPC regardless of grants.
revoke execute on function public.loop_approve_cost(uuid, uuid[], int) from public, anon;
grant  execute on function public.loop_approve_cost(uuid, uuid[], int) to authenticated, service_role;

revoke execute on function public.loop_kill_switch(uuid, boolean) from public, anon;
grant  execute on function public.loop_kill_switch(uuid, boolean) to authenticated, service_role;

revoke execute on function public.resolve_memory_event(uuid, text) from public, anon;
grant  execute on function public.resolve_memory_event(uuid, text) to authenticated, service_role;
