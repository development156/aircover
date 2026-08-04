-- ─────────────────────────────────────────────────────────────────────────────
-- Slice C · 04 · X, GBP and LinkedIn on the Zernio rail
--
-- Two gates hardcode `instagram`, and both were right when written: instagram was
-- the only channel Zernio fronted, and admitting the others would have created
-- 'active' connections with no credential behind them.
--
--   upsert_zernio_connection:  p_platform not in ('instagram') → INVALID_PLATFORM
--   assert_account_for_...  :  v_channel <> 'instagram'        → INVALID_VARIANT
--
-- ── WHY THE OTHER THREE MOVE TO ZERNIO TOO ───────────────────────────────────
-- x, gbp and linkedin were designed to hold OUR OAuth grant, with a sealed token
-- in connection_secrets. That design is sound and it is also unshipped: apps/jobs
-- has no vault opener (`openSecret` is deliberately unwired), so every one of
-- those publishes ends at CONNECTION_UNAVAILABLE. They have never posted anything.
--
-- Zernio fronts all four. Routing them the same way as instagram means one
-- credential model instead of two, one adapter shape instead of four, and no app
-- review with any of the platforms. The native adapters are NOT deleted — a
-- workspace that already holds its own X grant keeps working through them, and
-- the store picks whichever the connection row actually describes.
--
-- ── WHAT DOES NOT CHANGE ─────────────────────────────────────────────────────
-- The tenant boundary. Both functions still re-derive the profile from
-- zernio_profiles for the workspace derived from the post, and still return ONE
-- error for every lookup failure so a caller cannot enumerate another tenant's
-- accounts by probing. Widening WHICH channels may use the rail does not widen
-- WHO may reach an account through it.
--
-- The channel is still an allowlist and not `any text`: a typo like 'Instagram'
-- or a future platform nobody has wired must still be refused, because a
-- connection recorded under a channel no adapter handles is a row that looks live
-- and can never publish.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.upsert_zernio_connection(
  p_workspace_id     uuid,
  p_platform         text,
  p_external_account jsonb,
  p_profile_id       text,
  p_scopes           text[] default null,
  p_expires_at       timestamptz default null
) returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_user       text;
  v_ws_id      uuid;
  v_role       text;
  v_account_id text;
  v_mapped     text;
  v_conn_id    uuid;
begin
  v_user := auth.jwt() ->> 'sub';
  if v_user is null or v_user = '' then
    raise exception 'AUTH_REQUIRED' using errcode = 'raise_exception';
  end if;

  if p_workspace_id is null then
    raise exception 'INVALID_WORKSPACE' using errcode = 'raise_exception';
  end if;

  -- WIDENED. Still an allowlist: a channel with no adapter must never get a row
  -- that reads as an active connection.
  if p_platform is null or p_platform not in ('instagram', 'x', 'gbp', 'linkedin') then
    raise exception 'INVALID_PLATFORM' using errcode = 'raise_exception';
  end if;

  if jsonb_typeof(p_external_account) is distinct from 'object' then
    raise exception 'INVALID_ACCOUNT' using errcode = 'raise_exception';
  end if;

  v_account_id := nullif(btrim(coalesce(p_external_account ->> 'id', '')), '');
  if v_account_id is null or v_account_id !~ '^[0-9a-f]{24}$' then
    raise exception 'INVALID_ACCOUNT' using errcode = 'raise_exception';
  end if;

  if p_profile_id is null or p_profile_id !~ '^[0-9a-f]{24}$' then
    raise exception 'INVALID_PROFILE' using errcode = 'raise_exception';
  end if;

  select m.workspace_id, m.role into v_ws_id, v_role
  from workspace_members m
  where m.workspace_id = p_workspace_id and m.user_id = v_user;
  if not found then
    raise exception 'NOT_A_MEMBER' using errcode = 'raise_exception';
  end if;
  if v_role not in ('owner', 'editor') then
    raise exception 'FORBIDDEN_ROLE' using errcode = 'raise_exception';
  end if;

  -- THE TENANT BOUNDARY, unchanged. p_profile_id is only ever COMPARED.
  select profile_id into v_mapped from zernio_profiles where workspace_id = v_ws_id;
  if not found then
    raise exception 'NO_PROFILE_MAPPING' using errcode = 'raise_exception';
  end if;
  if v_mapped is distinct from p_profile_id then
    raise exception 'PROFILE_MISMATCH' using errcode = 'raise_exception';
  end if;

  insert into connections (
    workspace_id, platform, external_account, scopes, expires_at, status, created_by
  )
  values (
    v_ws_id,
    p_platform,
    jsonb_build_object('id', v_account_id, 'profileId', v_mapped)
      || (p_external_account - 'id' - 'profileId'),
    p_scopes,
    p_expires_at,
    'active',
    v_user
  )
  on conflict (workspace_id, platform, (external_account ->> 'id')) do update set
    external_account = excluded.external_account,
    scopes           = excluded.scopes,
    expires_at       = excluded.expires_at,
    status           = 'active'
  returning id into v_conn_id;

  -- connection_secrets is STILL not written. Not for any of the four.
  return jsonb_build_object('connection_id', v_conn_id);
end;
$$;

revoke all on function public.upsert_zernio_connection(
  uuid, text, jsonb, text, text[], timestamptz
) from public, anon;
grant execute on function public.upsert_zernio_connection(
  uuid, text, jsonb, text, text[], timestamptz
) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- assert_account_for_scheduled_post — the channel gate widens, nothing else.
--
-- Reproduced in full because `create or replace` on a plpgsql function has no
-- partial form. Every other line is identical to 20260804000000, including the
-- status gate fixed there and the single CROSS_TENANT_ACCOUNT error.
--
-- The channel is now checked against the connection's OWN platform rather than a
-- literal: the row we verify must be for the same channel as the variant, which
-- is a stronger statement than "the variant is instagram" ever was. A gbp variant
-- can no longer be matched against an x connection in the same workspace.
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

  select p.workspace_id, p.status into v_ws_id, v_status
  from posts p where p.id = p_post_id;
  if not found then
    raise exception 'INVALID_POST' using errcode = 'raise_exception';
  end if;

  if v_status not in ('approved', 'scheduled', 'publishing') then
    raise exception 'POST_NOT_PUBLISHABLE' using errcode = 'raise_exception';
  end if;

  select v.channel into v_channel
  from post_variants v
  where v.id = p_variant_id
    and v.post_id = p_post_id
    and v.workspace_id = v_ws_id;
  if not found then
    raise exception 'INVALID_VARIANT' using errcode = 'raise_exception';
  end if;
  -- WIDENED from `<> 'instagram'`. Still an allowlist.
  if v_channel not in ('instagram', 'x', 'gbp', 'linkedin') then
    raise exception 'INVALID_VARIANT' using errcode = 'raise_exception';
  end if;

  select profile_id into v_mapped from zernio_profiles where workspace_id = v_ws_id;
  if not found then
    raise exception 'NO_PROFILE_MAPPING' using errcode = 'raise_exception';
  end if;

  -- `c.platform = v_channel` rather than a literal: the connection must be for the
  -- SAME channel as the variant. Stronger than the old check, which only ever
  -- asked whether the variant was instagram.
  select c.external_account ->> 'id' into v_verified
  from connections c
  where c.workspace_id                     = v_ws_id
    and c.platform                         = v_channel
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
