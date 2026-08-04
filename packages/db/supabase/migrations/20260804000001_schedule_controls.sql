-- ─────────────────────────────────────────────────────────────────────────────
-- Slice C · 02 · reschedule and cancel
--
-- `release_post_for_publish` (migration 20260804000000) only ever moves a post
-- FORWARD, and fixes `scheduled_at` with `coalesce` so the idempotency key cannot
-- shift under a publisher that is already running. That is exactly right for
-- arming a post and exactly wrong for the two things a person also needs to do:
-- move a scheduled post to a different time, and call it off.
--
-- Both are separate functions rather than arguments to the first, because they
-- have a precondition the first one does not: the post must not already be out.
--
-- ── THE RULE BOTH OF THESE SHARE ─────────────────────────────────────────────
-- Neither may touch a post that has published ANYWHERE. Moving the schedule of a
-- post that is half-live re-arms the dispatcher on channels that already went out;
-- cancelling one tells the user it did not happen when it did. The predicate is
-- the same one `expirePost` carries — a NOT EXISTS over published variants — and
-- it lives in the statement rather than in a preceding check, because the sweep
-- can publish between a read and a write.
--
-- ── WHY RESCHEDULING IS ALLOWED TO CHANGE THE KEY ────────────────────────────
-- `${postId}:${channel}:${scheduledAt}` is deliberately sensitive to the time. A
-- post moved to Tuesday SHOULD mint a new key: it is a different post going out at
-- a different moment, and if it collapsed onto the old key Zernio would hand back
-- the previous post as `existingPost` and the reschedule would silently do nothing.
-- That is why an in-flight variant blocks a reschedule — the key must not move
-- under a publisher that already sent a request carrying the old one.
-- ─────────────────────────────────────────────────────────────────────────────

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
     set status = 'scheduled', scheduled_at = p_when
   where id = p_post_id;

  return jsonb_build_object('post_id', p_post_id, 'scheduled_at', p_when);
end;
$$;

comment on function public.reschedule_post(uuid, timestamptz) is
  'Move a scheduled post to a new time. Refuses once any variant is publishing or '
  'published: the publish idempotency key is derived from scheduled_at, and moving '
  'it under an in-flight request would mint a second key for the same work.';

revoke all on function public.reschedule_post(uuid, timestamptz) from public, anon;
grant execute on function public.reschedule_post(uuid, timestamptz) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- public.cancel_scheduled_post — take a post back out of the gate.
--
-- Returns it to 'draft' with no scheduled_at, which is the only state the
-- dispatcher will not pick up. Variants sitting `scheduled` are walked back to
-- `pending` in the same statement: leaving them `scheduled` on an unscheduled post
-- is a row that says two different things about the same intent.
--
-- A variant that FAILED is left alone. Its `last_error` is the record of what went
-- wrong and the user is entitled to still see it after cancelling.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.cancel_scheduled_post(
  p_post_id uuid
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
    raise exception 'INVALID_POST' using errcode = 'raise_exception';
  end if;
  if v_role not in ('owner', 'editor') then
    raise exception 'FORBIDDEN_ROLE' using errcode = 'raise_exception';
  end if;

  if exists (
    select 1 from post_variants v
     where v.post_id = p_post_id
       and v.publish_status in ('publishing', 'published')
  ) then
    -- Something is already out, or on its way. Cancelling would report a state
    -- that is not true of the customer's Instagram.
    raise exception 'POST_ALREADY_GOING_OUT' using errcode = 'raise_exception';
  end if;

  update posts
     set status = 'draft', scheduled_at = null
   where id = p_post_id;

  update post_variants
     set publish_status = 'pending', publish_claimed_at = null
   where post_id = p_post_id
     and publish_status = 'scheduled';

  return jsonb_build_object('post_id', p_post_id, 'status', 'draft');
end;
$$;

comment on function public.cancel_scheduled_post(uuid) is
  'Return a scheduled post to draft and clear its schedule, walking scheduled '
  'variants back to pending. Refuses once anything is publishing or published — a '
  'cancel that reports success on a live post is a lie about the customer''s feed.';

revoke all on function public.cancel_scheduled_post(uuid) from public, anon;
grant execute on function public.cancel_scheduled_post(uuid) to authenticated;
