-- ─────────────────────────────────────────────────────────────────────────────
-- Slice B · 05 · LAYER 3, service-role variant — for apps/jobs
--
-- 20260801000004 takes identity from auth.jwt(). apps/jobs has no JWT: it holds a
-- direct `pg` Pool over SUPABASE_DB_URL (apps/jobs/src/runtime.ts:53-56, an owner
-- connection that bypasses RLS the same way service_role does), so auth.jwt() is
-- NULL there and the jwt variant raises AUTH_REQUIRED on every call. That left the
-- scheduled publish path — the one that matters most — uncovered.
--
-- ── THE ONE DESIGN MOVE ──────────────────────────────────────────────────────
-- This function does NOT take a workspace id. There is no argument that names a
-- tenant, so there is no argument a caller can get wrong or lie about. The
-- workspace is DERIVED:
--
--     select workspace_id from posts where id = p_post_id
--
-- The dispatcher already works this way — apps/jobs/src/dispatch/pgDispatch.ts:100
-- reads `workspaceId: row.workspace_id` straight off the `posts` row its sweep
-- query selected (pgDispatch.ts:60-90). It then carries that value across the
-- Trigger.dev queue as `PublishPostPayload.workspaceId`
-- (runPublishPost.ts:35,57) and uses it to pick the connection
-- (publish/store.ts:120-123, `where c.workspace_id = $1`).
--
-- That payload field is the weak link: between enqueue and execute it is ordinary
-- queue data. This function refuses to read it. Give it the post and the variant;
-- it re-derives everything else.
--
-- ── WHY A BAD post_id CANNOT MIX TENANTS ─────────────────────────────────────
-- A caller on the service role can pass ANY p_post_id, and this function will
-- faithfully derive that post's workspace. It therefore does NOT prevent a
-- compromised caller from acting as some tenant — nothing at this layer can,
-- because the service role is by definition trusted to act as anyone.
--
-- What it does prevent is MIXING. Every downstream fact is re-derived from the one
-- workspace that the post belongs to:
--   · the variant must belong to that post AND that workspace. Not a convention —
--     post_variants carries
--       FOREIGN KEY (post_id, workspace_id) REFERENCES posts (id, workspace_id)
--     (verified live 2026-08-01), so a variant from another tenant cannot be
--     paired with this post at all. The database refuses to store the shape.
--   · the Zernio profile comes from zernio_profiles[that workspace].
--   · the account must sit on a connection in that workspace, under that profile.
-- So the reachable outcome is "workspace A's post published to workspace A's
-- Instagram". Workspace B's account is unreachable from workspace A's post.
--
-- ── THE STATUS GATE ──────────────────────────────────────────────────────────
-- The post must be in a publishing state. This is deliberate scope-narrowing, not
-- decoration: without it a replayed or stale job could publish a post that has
-- since been expired or withdrawn, and the publish would be legitimate by every
-- other check here. It couples this function loosely to the dispatch state machine;
-- that coupling is the point.
--
-- Errors (SQLSTATE P0001): INVALID_POST · INVALID_VARIANT · INVALID_ACCOUNT ·
-- POST_NOT_PUBLISHABLE · NO_PROFILE_MAPPING · CROSS_TENANT_ACCOUNT
-- Returns: the verified account id — never a boolean. Same reason as 04: a boolean
-- invites `if (ok) publish(accountId)`, two statements that can drift. You publish
-- what this returns, or you have nothing to publish with.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.assert_account_for_scheduled_post(
  p_post_id    uuid,
  p_variant_id uuid,
  p_account_id text
) returns text
language plpgsql
stable
security invoker           -- runs as the caller; the caller is already privileged.
set search_path = public   -- NOT definer: definer would make this callable by a
                           -- signed-in member with the owner's rights, which is
                           -- exactly the bypass of 04 that must not exist.
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
  if v_status not in ('scheduled', 'publishing') then
    raise exception 'POST_NOT_PUBLISHABLE' using errcode = 'raise_exception';
  end if;

  -- 3) The variant must belong to this post AND this workspace. The composite FK
  --    already makes the cross-tenant pairing unstorable; this re-reads it anyway,
  --    because a guard that assumes its own schema invariant is an assumption.
  select v.channel into v_channel
  from post_variants v
  where v.id = p_variant_id
    and v.post_id = p_post_id
    and v.workspace_id = v_ws_id;
  if not found then
    raise exception 'INVALID_VARIANT' using errcode = 'raise_exception';
  end if;
  if v_channel <> 'instagram' then
    -- Other channels hold their own credentials and do not route through Zernio;
    -- this guard has nothing to say about them.
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
    -- ONE error for every failure below this line — wrong workspace, wrong profile,
    -- revoked, absent. Distinguishing them would let a caller enumerate another
    -- tenant's account ids by probing. Same rule as 04.
    raise exception 'CROSS_TENANT_ACCOUNT' using errcode = 'raise_exception';
  end if;

  return v_verified;
end;
$$;

comment on function public.assert_account_for_scheduled_post(uuid, uuid, text) is
  'Layer 3 for apps/jobs, which has no JWT. Takes NO workspace argument: the '
  'workspace is derived from posts.workspace_id and every downstream fact is '
  're-derived from it. Prevents cross-tenant MIXING, not tenant impersonation — '
  'a service-role caller can act as any tenant by choosing p_post_id, but cannot '
  'reach another tenant''s account from this post. The trust boundary is exactly '
  'one column: posts.workspace_id, written by apps/web under RLS.';

-- MUST NOT be reachable over PostgREST by a signed-in member: that would be a way
-- to obtain a verified account id without the auth.jwt() checks in migration 04.
revoke all on function public.assert_account_for_scheduled_post(uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.assert_account_for_scheduled_post(uuid, uuid, text)
  to service_role;
