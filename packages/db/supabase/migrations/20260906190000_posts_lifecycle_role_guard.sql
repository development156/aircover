-- ─────────────────────────────────────────────────────────────────────────────
-- posts · lifecycle writes are role-gated IN THE DATABASE, and approval is a fact
--
-- ── THE HOLE (R1) ────────────────────────────────────────────────────────────
-- `posts` carries the plain tenant policy from `app.apply_tenant_policies`, so
-- `t_update` is membership-only: any member of the workspace may write any
-- column. 20260902220002 closed `publishing` and `published`, and nothing else.
-- Every other lifecycle move was still a PostgREST write away, and the only
-- thing standing between a viewer and a scheduled post was a role check in a
-- server action that a hand-rolled request never passes through.
--
-- MEASURED 2026-09-06 on production, with a member's own JWT through PostgREST:
--   update posts set status = 'scheduled', scheduled_at = now()  → 200, 1 row
--   update posts set status = 'partial'                          → 200, 1 row
--   update posts set status = 'published'                        → refused
-- A viewer can arm the dispatcher. A viewer can mark a post half-live. Only the
-- one word the earlier guard named was refused.
--
-- ── THE RULING (R2) ──────────────────────────────────────────────────────────
-- Approval is RECORDED (who, when), and approving a DATED post schedules it.
--   `approved`  = cleared, no time yet
--   `scheduled` = cleared and dated
-- An owner or editor who schedules a post themselves (release_post_for_publish,
-- reschedule_post) is recorded as self-approving at that moment. Before this,
-- `approvePost` wrote `{ status: 'approved' }` and no approver, and `posts` had
-- no column to hold one (apps/jobs/src/gate/store.ts says so in as many words).
--
-- ── THE GUARD ────────────────────────────────────────────────────────────────
-- One BEFORE INSERT OR UPDATE trigger, `posts_lifecycle_role_guard`, that runs
-- ONLY when `current_user` is a PostgREST role (`anon`, `authenticated`). The
-- publisher's postgres pool, every SECURITY DEFINER RPC (release / reschedule /
-- cancel / the loop and playbook kill switches / approve_posts below) and the
-- migrations themselves run as the owner and are untouched.
--
--   INSERT  · status must be one of idea / draft / review, and approved_by /
--             approved_at must be null. Plan-my-week inserts DRAFTS carrying
--             scheduled_at and channels through the authenticated client, and
--             that keeps working: the guard reads status, not the date.
--   UPDATE  · (a) a status change is allowed only INSIDE the draft set
--                 {idea, draft, review}, plus ONE allowance: draft set → approved
--                 under an owner, editor or approver (the wt-web compatibility
--                 path, next section). That one rule closes scheduled, partial,
--                 failed, expired, publishing and published from PostgREST, and
--                 the walk-back OUT of published / partial too.
--             (b) a scheduled_at change needs the caller's role in the row's
--                 workspace to be owner or editor, AND the post must not have
--                 settled (published, partial, publishing, failed, expired).
--             (c) approved_by / approved_at may not be written at all.
-- Every refusal raises POST_LIFECYCLE_ROLE (SQLSTATE P0001).
--
-- ── THE wt-web COMPATIBILITY PATH (TEMPORARY) ────────────────────────────────
-- Production (wt-web) shares this database and still runs the OLD approve:
-- `update posts set status = 'approved'` through the authenticated client
-- (apps/web/src/app/actions/approvals.ts, planner.ts), with the role check in
-- the server action. Refusing that write would break approvals in production
-- the moment this migration is applied, before wt-core's approve_posts caller
-- is promoted. So rule (a) admits exactly that shape, and nothing wider:
--   old.status in (idea, draft, review) and new.status = 'approved'
--   and the caller's role in the row's workspace is owner / editor / approver.
-- The role gate is the same allowlist approve_posts carries, so R1 still holds
-- (a viewer or a non-member is refused). What this path does NOT do is R2: no
-- approved_by / approved_at is recorded, and a dated post approved this way
-- stays `approved` rather than becoming `scheduled`. That is the old meaning,
-- kept alive only for the old caller.
--
-- REMOVE once wt-core is promoted and approvePost / approvePosts call
-- public.approve_posts: delete the second `and not (…)` in rule (a) and the two
-- compatibility tests in posts_lifecycle_role_guard.pglite.test.ts, and flip the
-- approver's direct-approve test to expect POST_LIFECYCLE_ROLE.
--
-- `posts_publish_state_service_only` (20260902220002) stays in place, unedited.
-- Triggers fire in name order and `posts_lifecycle_…` sorts before
-- `posts_publish_…`, so a member's `status = 'published'` now meets THIS guard
-- first and reads POST_LIFECYCLE_ROLE. The older posts-half is subsumed, not
-- removed: dropping this trigger puts that one back in front, and the variant
-- half of that migration is untouched by anything here.
--
-- ── THE MOVES THAT REMAIN, AND WHERE THEY LIVE ───────────────────────────────
--   draft ⇄ review ⇄ idea            · any member, direct (savePost)
--   → approved / → scheduled         · public.approve_posts (owner, editor, approver)
--   draft set → approved, direct     · owner, editor, approver ONLY, the wt-web
--                                      compatibility path above (temporary)
--   → scheduled with a fixed time    · release_post_for_publish, reschedule_post
--                                      (owner, editor; now record self-approval)
--   scheduled → draft                · cancel_scheduled_post (owner, editor)
--   failed / expired → draft         · cancel_scheduled_post; the direct
--                                      re-draft 20260902220002 left open is closed
--   → publishing / published / partial / failed / expired
--                                    · the publisher (postgres pool) only
--
-- ── THE PROOF ────────────────────────────────────────────────────────────────
-- packages/db/tests/posts_lifecycle_role_guard.pglite.test.ts. Mutation: in
-- `app.posts_lifecycle_role_guard`, change
--     if current_user not in ('anon', 'authenticated') then
-- to
--     if current_user not in ('nobody') then
-- and every PostgREST-role refusal is accepted again: the 4×2 direct-status
-- tests, the two walk-backs (published, partial), the two refused inserts, the
-- three scheduled_at refusals and the four direct approved_by writes. MEASURED
-- 2026-09-06 in PGlite: 21 failed | 23 passed (44) with the wt-web compatibility
-- tests in place (the viewer's refused direct approve and the approver's refused
-- direct schedule join the red set), the first red line being
--   × REFUSES the viewer setting status = scheduled directly
-- with `expected 'ACCEPTED' to contain 'POST_LIFECYCLE_ROLE'`.
--
-- schedule_guard_parity.test.ts parses the LAST definition of
-- release_post_for_publish and reschedule_post out of this directory. Both are
-- redefined below with their `v_status in (…)` guard byte-identical to the
-- 20260804 originals; the only change in either body is the UPDATE's set list.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1 · the record of approval ────────────────────────────────────────────────

alter table public.posts
  add column if not exists approved_by text,
  add column if not exists approved_at timestamptz;

comment on column public.posts.approved_by is
  'Clerk user id (same shape as created_by) of whoever cleared this post: an '
  'approver through approve_posts, or an owner/editor who scheduled it '
  'themselves. Written only by SECURITY DEFINER RPCs; the lifecycle guard '
  'refuses a direct write.';
comment on column public.posts.approved_at is
  'When approved_by cleared it. Null until then. Not reset by cancel: the '
  'record of a past approval is not undone by un-scheduling.';

-- ── 2 · who is asking, in this workspace ──────────────────────────────────────
-- SECURITY INVOKER on purpose: it runs from inside a BEFORE trigger as the
-- PostgREST role, and `wm_select` (20260718000002) lets a member read the
-- membership rows of their own workspaces, which is the only row this reads.
-- A non-member gets null, and null is in no allowlist.

create or replace function app.caller_role(p_workspace_id uuid) returns text
language sql
stable
security invoker
set search_path = public, app
as $$
  select m.role
    from workspace_members m
   where m.workspace_id = p_workspace_id
     and m.user_id = (select auth.jwt() ->> 'sub')
   limit 1;
$$;

comment on function app.caller_role(uuid) is
  'workspace_members.role of the JWT subject in the given workspace, or null. '
  'Invoker, so it sees exactly what the caller''s own membership policy shows.';

revoke all on function app.caller_role(uuid) from public;
grant execute on function app.caller_role(uuid) to authenticated, anon;

-- ── 3 · the guard ─────────────────────────────────────────────────────────────

create or replace function app.posts_lifecycle_role_guard() returns trigger
language plpgsql
set search_path = public, app
as $$
begin
  if current_user not in ('anon', 'authenticated') then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.status not in ('idea', 'draft', 'review')
       or new.approved_by is not null
       or new.approved_at is not null
    then
      raise exception 'POST_LIFECYCLE_ROLE' using errcode = 'raise_exception';
    end if;
    return new;
  end if;

  -- (a) a status change stays inside the draft set, or it does not happen here.
  --     The one allowance: draft-set → approved under an owner/editor/approver,
  --     which is the wt-web compatibility path (see header). Remove it once
  --     wt-core is promoted and approvePost calls approve_posts.
  if new.status is distinct from old.status
     and not (old.status in ('idea', 'draft', 'review')
              and new.status in ('idea', 'draft', 'review'))
     and not (old.status in ('idea', 'draft', 'review')
              and new.status = 'approved'
              and coalesce(app.caller_role(new.workspace_id), '') in ('owner', 'editor', 'approver'))
  then
    raise exception 'POST_LIFECYCLE_ROLE' using errcode = 'raise_exception';
  end if;

  -- (b) the date moves only under an owner/editor, and never once it has settled.
  if new.scheduled_at is distinct from old.scheduled_at then
    -- coalesce: a null role (non-member) must read as refused, and `null not in`
    -- is null, which an IF treats as false.
    if coalesce(app.caller_role(new.workspace_id), '') not in ('owner', 'editor')
       or old.status in ('published', 'partial', 'publishing', 'failed', 'expired')
    then
      raise exception 'POST_LIFECYCLE_ROLE' using errcode = 'raise_exception';
    end if;
  end if;

  -- (c) the record of approval is written by the RPCs below and nowhere else.
  if new.approved_by is distinct from old.approved_by
     or new.approved_at is distinct from old.approved_at
  then
    raise exception 'POST_LIFECYCLE_ROLE' using errcode = 'raise_exception';
  end if;

  return new;
end;
$$;

comment on function app.posts_lifecycle_role_guard() is
  'BEFORE INSERT OR UPDATE on posts, for the PostgREST roles only: a status '
  'change stays inside idea/draft/review, scheduled_at moves only under an '
  'owner or editor on an unsettled post, and approved_by/approved_at are never '
  'written directly. Every other writer is a SECURITY DEFINER RPC or the '
  'publisher''s postgres pool, which this function does not see.';

drop trigger if exists posts_lifecycle_role_guard on public.posts;
create trigger posts_lifecycle_role_guard
  before insert or update on public.posts
  for each row execute function app.posts_lifecycle_role_guard();

-- ── 4 · approve_posts ─────────────────────────────────────────────────────────
-- The one door into `approved` and the second door into `scheduled`. Identity
-- from auth.jwt() as release_post_for_publish does; the role allowlist is the
-- one canApproveAsRole carries in apps/web (owner, editor, approver).
--
-- Zero matched rows is NOT an error. The screen may be stale: a post already
-- approved, already scheduled, already claimed by the publisher, or deleted,
-- simply is not in the result, and apps/web reports it as "had already moved
-- on" rather than as a refusal.
--
-- A NON-MEMBER of the posts' workspace also gets the empty set, not an error.
-- This mirrors release_post_for_publish's "no existence oracle" rule (it raises
-- INVALID_POST for member-not-found and post-not-found alike): a definer body
-- reads past RLS, so if a stranger got FORBIDDEN_ROLE for a real id and nothing
-- for a missing one, the two sentences would leak which uuids exist. Only a
-- MEMBER whose role is outside the allowlist (viewer) is told FORBIDDEN_ROLE.
--
-- Errors (SQLSTATE P0001): NOT_SIGNED_IN · POSTS_SPAN_WORKSPACES · FORBIDDEN_ROLE

create or replace function public.approve_posts(p_post_ids uuid[])
returns setof public.posts
language plpgsql
volatile
security definer
set search_path = public, app
as $$
declare
  v_user text;
  v_ws   uuid;
  v_n    integer;
  v_role text;
begin
  v_user := auth.jwt() ->> 'sub';
  if v_user is null or v_user = '' then
    raise exception 'NOT_SIGNED_IN' using errcode = 'raise_exception';
  end if;

  if p_post_ids is null or cardinality(p_post_ids) = 0 then
    return;
  end if;

  -- One workspace per call. A batch that straddles two would need two role
  -- checks and could half-succeed; refusing is the only honest answer.
  -- (array_agg(distinct …))[1] because Postgres has no min() over uuid.
  select count(distinct p.workspace_id), (array_agg(distinct p.workspace_id))[1]
    into v_n, v_ws
    from posts p
   where p.id = any(p_post_ids);
  if v_n > 1 then
    raise exception 'POSTS_SPAN_WORKSPACES' using errcode = 'raise_exception';
  end if;
  if v_n = 0 then
    -- Nothing by those ids at all: every one of them has moved on (or never was).
    return;
  end if;

  select m.role into v_role
    from workspace_members m
   where m.workspace_id = v_ws and m.user_id = v_user;
  if v_role is null then
    -- No existence oracle, the same reasoning as release_post_for_publish's
    -- INVALID_POST: a non-member gets exactly what a nonexistent id gets (an
    -- empty set), so a stranger cannot tell a real post from a missing one by
    -- reading which sentence comes back.
    return;
  end if;
  if v_role not in ('owner', 'editor', 'approver') then
    raise exception 'FORBIDDEN_ROLE' using errcode = 'raise_exception';
  end if;

  return query
    update posts
       set status      = case when scheduled_at is not null then 'scheduled' else 'approved' end,
           approved_by = v_user,
           approved_at = now()
     where id = any(p_post_ids)
       and workspace_id = v_ws
       and status in ('idea', 'draft', 'review')
    returning *;
end;
$$;

comment on function public.approve_posts(uuid[]) is
  'Clear one or more posts of ONE workspace as owner, editor or approver. A dated '
  'post becomes scheduled, an undated one approved, and approved_by/approved_at '
  'record who and when. Rows already past the draft set are not returned and not '
  'an error: the caller reports them as having moved on. A non-member gets the '
  'same empty set as a missing id (no existence oracle); a member outside the '
  'allowlist gets FORBIDDEN_ROLE.';

revoke all on function public.approve_posts(uuid[]) from public, anon;
grant execute on function public.approve_posts(uuid[]) to authenticated;

-- ── 5a · release_post_for_publish — REPLACED to record self-approval ─────────
-- Every line except the UPDATE's set list is byte-identical to 20260804000000.
-- The whole body is reproduced because `create or replace` on plpgsql has no
-- partial form. `coalesce` on both new columns: a post an approver already
-- cleared keeps that record when an editor later releases it.

create or replace function public.release_post_for_publish(
  p_post_id uuid,
  p_when    timestamptz default null
) returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_user     text;
  v_ws_id    uuid;
  v_role     text;
  v_status   text;
  v_when     timestamptz := coalesce(p_when, now());
  v_settled  timestamptz;
begin
  v_user := auth.jwt() ->> 'sub';
  if v_user is null or v_user = '' then
    raise exception 'AUTH_REQUIRED' using errcode = 'raise_exception';
  end if;
  if p_post_id is null then
    raise exception 'INVALID_POST' using errcode = 'raise_exception';
  end if;

  select p.workspace_id, p.status into v_ws_id, v_status
  from posts p where p.id = p_post_id;
  if not found then
    raise exception 'INVALID_POST' using errcode = 'raise_exception';
  end if;

  select m.role into v_role
  from workspace_members m
  where m.workspace_id = v_ws_id and m.user_id = v_user;
  if not found then
    -- No existence oracle: a non-member cannot tell a real post from a missing one.
    raise exception 'INVALID_POST' using errcode = 'raise_exception';
  end if;
  if v_role not in ('owner', 'editor') then
    raise exception 'FORBIDDEN_ROLE' using errcode = 'raise_exception';
  end if;

  -- Already past the gate. Never walk a post BACK from published/failed/expired
  -- into scheduled: that would re-arm the dispatcher on something already settled.
  if v_status in ('published', 'failed', 'expired', 'publishing') then
    raise exception 'POST_NOT_RELEASABLE' using errcode = 'raise_exception';
  end if;

  update posts
     set status       = 'scheduled',
         scheduled_at = coalesce(scheduled_at, v_when),
         approved_by  = coalesce(posts.approved_by, v_user),
         approved_at  = coalesce(posts.approved_at, now())
   where id = p_post_id
  returning scheduled_at into v_settled;

  return jsonb_build_object('post_id', p_post_id, 'scheduled_at', v_settled);
end;
$$;

comment on function public.release_post_for_publish(uuid, timestamptz) is
  'Move a post into DISPATCHABLE_STATUSES and fix its scheduled_at exactly once. '
  'The returned scheduled_at is the third term of the publish idempotency key, so '
  'it must come from the ROW rather than from any caller''s clock — otherwise two '
  'racing publishers mint two keys for one post and both are accepted. Records '
  'the caller as approver unless somebody already was.';

revoke all on function public.release_post_for_publish(uuid, timestamptz)
  from public, anon;
grant execute on function public.release_post_for_publish(uuid, timestamptz)
  to authenticated;

-- ── 5b · reschedule_post — REPLACED to record self-approval ──────────────────
-- Every line except the UPDATE's set list is byte-identical to 20260804000001.

create or replace function public.reschedule_post(
  p_post_id uuid,
  p_when    timestamptz
) returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_user   text;
  v_ws_id  uuid;
  v_role   text;
  v_status text;
begin
  v_user := auth.jwt() ->> 'sub';
  if v_user is null or v_user = '' then
    raise exception 'AUTH_REQUIRED' using errcode = 'raise_exception';
  end if;
  if p_post_id is null or p_when is null then
    raise exception 'INVALID_POST' using errcode = 'raise_exception';
  end if;

  select p.workspace_id, p.status into v_ws_id, v_status
  from posts p where p.id = p_post_id;
  if not found then
    raise exception 'INVALID_POST' using errcode = 'raise_exception';
  end if;

  select m.role into v_role
  from workspace_members m
  where m.workspace_id = v_ws_id and m.user_id = v_user;
  if not found then
    raise exception 'INVALID_POST' using errcode = 'raise_exception';
  end if;
  if v_role not in ('owner', 'editor') then
    raise exception 'FORBIDDEN_ROLE' using errcode = 'raise_exception';
  end if;

  if v_status in ('published', 'failed', 'expired', 'publishing') then
    raise exception 'POST_NOT_RESCHEDULABLE' using errcode = 'raise_exception';
  end if;

  -- A variant mid-publish holds a claim and has already sent a request carrying
  -- the old key. Moving the time under it would mint a second key for work that
  -- is still in flight.
  if exists (
    select 1 from post_variants v
     where v.post_id = p_post_id
       and v.publish_status in ('publishing', 'published')
  ) then
    raise exception 'POST_ALREADY_GOING_OUT' using errcode = 'raise_exception';
  end if;

  update posts
     set status = 'scheduled', scheduled_at = p_when,
         approved_by = coalesce(posts.approved_by, v_user),
         approved_at = coalesce(posts.approved_at, now())
   where id = p_post_id;

  return jsonb_build_object('post_id', p_post_id, 'scheduled_at', p_when);
end;
$$;

comment on function public.reschedule_post(uuid, timestamptz) is
  'Move a scheduled post to a new time. Refuses once any variant is publishing or '
  'published: the publish idempotency key is derived from scheduled_at, and moving '
  'it under an in-flight request would mint a second key for the same work. '
  'Records the caller as approver unless somebody already was.';

revoke all on function public.reschedule_post(uuid, timestamptz) from public, anon;
grant execute on function public.reschedule_post(uuid, timestamptz) to authenticated;

-- ── 6 · backfill ──────────────────────────────────────────────────────────────
-- R2 says `approved` means "cleared, no time yet". Any row that is approved AND
-- carries a scheduled_at was cleared and dated under the old meaning (approvePost
-- wrote the status and left the date alone), and under the new one that row is
-- `scheduled`. Idempotent: a second run matches nothing. approved_by/approved_at
-- stay null on these rows because nothing recorded who cleared them.

update public.posts
   set status = 'scheduled'
 where status = 'approved'
   and scheduled_at is not null;

-- ── ROLLBACK ──────────────────────────────────────────────────────────────────
-- drop trigger if exists posts_lifecycle_role_guard on public.posts;
-- drop function if exists app.posts_lifecycle_role_guard();
-- drop function if exists app.caller_role(uuid);
-- drop function if exists public.approve_posts(uuid[]);
-- -- then re-run the 20260804000000 and 20260804000001 bodies of
-- -- release_post_for_publish / reschedule_post (they reference the two columns);
-- alter table public.posts drop column if exists approved_by, drop column if exists approved_at;
-- -- The backfill is NOT reversed: an approved+dated row that became scheduled
-- -- cannot be told apart from one scheduled by release_post_for_publish.
-- ─────────────────────────────────────────────────────────────────────────────
