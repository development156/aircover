-- ─────────────────────────────────────────────────────────────────────────────
-- Slice C · 01 · The publish claim, and the status gate that never lined up
--
-- ── WHY A CLAIM IS THE FEATURE AND NOT A PRECAUTION ──────────────────────────
-- Vercel documents that cron delivery can BOTH duplicate and miss invocations.
-- apps/jobs/CLAUDE.md records the consequence honestly: "no UPDATE anywhere in
-- this repo sets publish_status = 'publishing'", so the dispatcher refuses to
-- publish at all and counts every due post as `queueUnavailable`. Scheduling has
-- therefore never worked — not because the adapter was wrong, but because there
-- was nothing to stop two overlapping ticks publishing the same post twice.
--
-- Zernio's 5-minute idempotency window is real but it is NOT this guarantee. It
-- collapses two requests that carry the same x-request-id inside five minutes. A
-- cron that fires twice six minutes apart, or a manual publish racing a sweep,
-- mints two Instagram posts and both come back 201. The database has to be the
-- thing that says "one of you".
--
-- ── WHY A LEASE AND NOT A PLAIN FLAG ─────────────────────────────────────────
-- apps/jobs/CLAUDE.md, rule 3: "a run that dies would strand it there forever".
-- That objection is correct against a bare `publish_status = 'publishing'` and it
-- is what this column answers. The claim is (status, claimed_at) together: a row
-- is claimed only while `publish_claimed_at` is inside the lease, so a process
-- killed mid-publish releases its claim by the passage of time and nothing needs
-- to notice it died.
--
-- The lease is the CRASH backstop, not the normal path. The runner hands the claim
-- back explicitly the moment a transient failure is classified, so a retry waits
-- milliseconds rather than minutes. The lease only matters when the process was
-- not alive to do that.
--
-- No new state is introduced: `publish_status = 'publishing'` already exists in
-- the enum and `classify.ts` already reads it as `in-flight` and holds. This gives
-- that state a writer for the first time, and an expiry so it cannot be a trap.
--
-- ── THE STATUS GATE THAT DID NOT LINE UP ─────────────────────────────────────
-- Two state machines disagreed about which posts may publish:
--
--   DISPATCHABLE_STATUSES (shared/publishing/schedule.ts)  = approved, scheduled
--   assert_account_for_scheduled_post (migration 05) gate  = scheduled, publishing
--
-- `approved` is in the first and not the second. So every post the dispatcher was
-- built to pick up would have been refused by the guard with POST_NOT_PUBLISHABLE
-- — the two halves of the scheduled path could never both agree to the same post.
-- Nothing caught it because nothing has ever run the scheduled path end to end.
--
-- Fixed by widening the gate to the dispatchable set plus `publishing`, so the
-- guard admits exactly what the dispatcher offers it and nothing more. `draft` is
-- deliberately still refused: the gate exists so a replayed or stale job cannot
-- publish a post that was never released for publishing, and `draft` is the
-- default every post is created in.
-- ─────────────────────────────────────────────────────────────────────────────

alter table post_variants
  add column if not exists publish_claimed_at timestamptz;

comment on column post_variants.publish_claimed_at is
  'When a publisher took this variant. Meaningful ONLY together with '
  'publish_status = ''publishing'': the pair is the lease. A claim older than the '
  'lease window is reclaimable, which is what stops a process that died mid-publish '
  'from stranding the row forever. Cleared on every terminal outcome.';

-- The reclaim scan looks for stale claims; without this it is a seq scan over every
-- variant ever written. Partial, because only claimed rows are ever the subject of
-- that question and the index should not carry the millions that are not.
create index if not exists post_variants_claimed_idx
  on post_variants (publish_claimed_at)
  where publish_status = 'publishing';

-- ─────────────────────────────────────────────────────────────────────────────
-- assert_account_for_scheduled_post — REPLACED for the status gate only.
--
-- Every other line is byte-identical to 20260801000005. The derivation, the
-- workspace-from-post rule, the single CROSS_TENANT_ACCOUNT error for all lookup
-- failures, the security invoker choice and the grants are unchanged and are
-- reproduced here in full rather than patched, because `create or replace` on a
-- plpgsql function has no partial form — the whole body is the unit of change.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.assert_account_for_scheduled_post(
  p_post_id    uuid,
  p_variant_id uuid,
  p_account_id text
) returns text
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  v_ws_id    uuid;
  v_status   text;
  v_channel  text;
  v_mapped   text;
  v_verified text;
begin
  if p_post_id is null then
    raise exception 'INVALID_POST' using errcode = 'raise_exception';
  end if;
  if p_variant_id is null then
    raise exception 'INVALID_VARIANT' using errcode = 'raise_exception';
  end if;
  if p_account_id is null or p_account_id !~ '^[0-9a-f]{24}$' then
    raise exception 'INVALID_ACCOUNT' using errcode = 'raise_exception';
  end if;

  -- 1) THE DERIVATION. The workspace is a property of the post, never an argument.
  select p.workspace_id, p.status into v_ws_id, v_status
  from posts p where p.id = p_post_id;
  if not found then
    raise exception 'INVALID_POST' using errcode = 'raise_exception';
  end if;

  -- 2) The post must still be publishable. A stale or replayed job stops here.
  --    'approved' added: it is in DISPATCHABLE_STATUSES, so omitting it meant the
  --    dispatcher and this guard could never agree on the same post. See header.
  if v_status not in ('approved', 'scheduled', 'publishing') then
    raise exception 'POST_NOT_PUBLISHABLE' using errcode = 'raise_exception';
  end if;

  -- 3) The variant must belong to this post AND this workspace.
  select v.channel into v_channel
  from post_variants v
  where v.id = p_variant_id
    and v.post_id = p_post_id
    and v.workspace_id = v_ws_id;
  if not found then
    raise exception 'INVALID_VARIANT' using errcode = 'raise_exception';
  end if;
  if v_channel <> 'instagram' then
    raise exception 'INVALID_VARIANT' using errcode = 'raise_exception';
  end if;

  -- 4) Profile derived from the workspace derived from the post.
  select profile_id into v_mapped from zernio_profiles where workspace_id = v_ws_id;
  if not found then
    raise exception 'NO_PROFILE_MAPPING' using errcode = 'raise_exception';
  end if;

  -- 5) Same predicate as 04, on the workspace we derived rather than one we were told.
  select c.external_account ->> 'id' into v_verified
  from connections c
  where c.workspace_id                     = v_ws_id
    and c.platform                         = 'instagram'
    and c.external_account ->> 'id'        = p_account_id
    and c.external_account ->> 'profileId' = v_mapped
    and c.status                           = 'active';

  if v_verified is null then
    raise exception 'CROSS_TENANT_ACCOUNT' using errcode = 'raise_exception';
  end if;

  return v_verified;
end;
$$;

revoke all on function public.assert_account_for_scheduled_post(uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.assert_account_for_scheduled_post(uuid, uuid, text)
  to service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- public.release_post_for_publish — move a post into the gate, idempotently.
--
-- Posts are created 'draft' and NOTHING in apps/web has ever changed that: there
-- is no approve control and setting a schedule wrote `scheduled_at` while leaving
-- the status alone. So every post in the product sits outside DISPATCHABLE_STATUSES
-- forever, which is the second reason scheduling has never run.
--
-- ── WHY IT RETURNS scheduled_at ──────────────────────────────────────────────
-- The idempotency key is `${postId}:${channel}:${scheduledAt}`, and it must be the
-- SAME string for every worker racing on one post. Deriving it from a clock at the
-- call site gives each caller a different one — two rapid "publish now" presses
-- would mint two keys and Zernio would accept two posts.
--
-- So the timestamp is written ONCE, here, with `coalesce(scheduled_at, p_when)`:
-- the first caller sets it, every later caller reads back what the first one
-- wrote. The key is a property of the row, not of whoever asked.
--
-- Identity comes from auth.jwt() and the role allowlist matches the one that can
-- connect an account — putting content on a public account is the same class of
-- action as attaching the account.
--
-- Errors (SQLSTATE P0001): AUTH_REQUIRED · INVALID_POST · NOT_A_MEMBER ·
-- FORBIDDEN_ROLE · POST_NOT_RELEASABLE
-- ─────────────────────────────────────────────────────────────────────────────

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
         scheduled_at = coalesce(scheduled_at, v_when)
   where id = p_post_id
  returning scheduled_at into v_settled;

  return jsonb_build_object('post_id', p_post_id, 'scheduled_at', v_settled);
end;
$$;

comment on function public.release_post_for_publish(uuid, timestamptz) is
  'Move a post into DISPATCHABLE_STATUSES and fix its scheduled_at exactly once. '
  'The returned scheduled_at is the third term of the publish idempotency key, so '
  'it must come from the ROW rather than from any caller''s clock — otherwise two '
  'racing publishers mint two keys for one post and both are accepted.';

revoke all on function public.release_post_for_publish(uuid, timestamptz)
  from public, anon;
grant execute on function public.release_post_for_publish(uuid, timestamptz)
  to authenticated;
