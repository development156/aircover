-- ─────────────────────────────────────────────────────────────────────────────
-- Slice B · 01 · widen the connection platform vocabulary to include 'instagram'
--
-- WHY THIS IS ONE MIGRATION AND NOT TWO.
-- The platform vocabulary is written in three places that must always agree:
--   1. connections_platform_check          (this file)
--   2. public.upsert_connection's guard     (this file, via create-or-replace)
--   3. ConnectionPlatformSchema             (packages/shared/src/enums.ts — TypeScript)
-- (1) and (2) are the two that can diverge *inside the database*, and a window
-- where they disagree is a real state: the table would accept a row the RPC
-- refuses (harmless) or — if they were widened in the other order — the RPC would
-- write a value the table rejects, turning a validation error into a constraint
-- violation with a worse message. Putting both in one migration means they move
-- in one transaction and that window cannot exist.
--
-- (3) is TypeScript and cannot be transactional with SQL. It is widened in the
-- same commit and pinned by a test that reads this constraint back from the
-- database, so the drift is detected rather than assumed away.
--
-- WHY ONLY 'instagram' AND NOT THE REST OF ZERNIO'S CATALOGUE.
-- ChannelSchema is ['x','gbp','linkedin','instagram']. Widening the connection
-- vocabulary past the channel vocabulary would let us store a connection for a
-- channel the product cannot address. Doc 13 §6 lists a dozen more platforms
-- Zernio supports; each arrives with its own constraint work. Widening later is
-- safe, narrowing later breaks people — the same asymmetry upsert_connection's
-- role allowlist is built on.
--
-- EXISTING DATA. A CHECK widening never fails on existing rows: every current
-- value ('x','gbp') remains in the new set. Verified before writing — the table
-- holds 2 rows, both demo seed, platforms 'x' and 'gbp'.
-- ─────────────────────────────────────────────────────────────────────────────

alter table connections drop constraint connections_platform_check;

alter table connections add constraint connections_platform_check
  check (platform in ('x', 'gbp', 'linkedin', 'instagram'));

comment on column connections.platform is
  'ConnectionPlatformSchema. Kept in lockstep with the CHECK above and with '
  'public.upsert_connection''s guard. NOT every Channel is storable here and NOT '
  'every stored platform holds a credential: x/gbp/linkedin bind an OAuth grant we '
  'hold in connection_secrets; instagram binds a Zernio account reference and has '
  'NO row in connection_secrets — Zernio holds that token, we never see it.';

-- ─────────────────────────────────────────────────────────────────────────────
-- public.upsert_connection — REPLACED, one line changed.
--
-- 20260719160916_add_upsert_connection.sql is applied and therefore immutable
-- (packages/db/CLAUDE.md). The body below is that function verbatim except for the
-- p_platform guard, which gains 'instagram'. Its full header — the sealed-secret
-- mapping, the invariant list, the error vocabulary — remains authoritative in the
-- original migration and is deliberately not duplicated here.
--
-- NOTE this function still REQUIRES a sealed access token (INVALID_SECRET when
-- absent). That is correct for x/gbp/linkedin and wrong for instagram, which has
-- no token. Instagram therefore does NOT travel through this function — see
-- 20260801000003_upsert_zernio_connection.sql. 'instagram' is added to this guard
-- only so the two in-database vocabularies cannot disagree, not to invite its use.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.upsert_connection(
  p_workspace_id      uuid,
  p_platform          text,
  p_external_account  jsonb,
  p_scopes            text[],
  p_expires_at        timestamptz,
  p_access_token_enc  jsonb,
  p_refresh_token_enc jsonb default null,
  p_token_type        text default null
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
  v_conn_id    uuid;
begin
  -- 1) identity from the JWT, never from arguments
  v_user := auth.jwt() ->> 'sub';
  if v_user is null or v_user = '' then
    raise exception 'AUTH_REQUIRED' using errcode = 'raise_exception';
  end if;

  if p_workspace_id is null then
    raise exception 'INVALID_WORKSPACE' using errcode = 'raise_exception';
  end if;

  -- 2) boundary validation. NULL-total throughout: PostgREST forwards an explicit
  --    JSON null verbatim, and a comparison against NULL is NULL, never true.
  --    CHANGED IN THIS MIGRATION: 'instagram' added, matching the table CHECK.
  if p_platform is null
     or p_platform not in ('x', 'gbp', 'linkedin', 'instagram') then
    raise exception 'INVALID_PLATFORM' using errcode = 'raise_exception';
  end if;

  if jsonb_typeof(p_external_account) is distinct from 'object' then
    raise exception 'INVALID_ACCOUNT' using errcode = 'raise_exception';
  end if;
  v_account_id := nullif(btrim(coalesce(p_external_account ->> 'id', '')), '');
  if v_account_id is null then
    raise exception 'INVALID_ACCOUNT' using errcode = 'raise_exception';
  end if;

  if jsonb_typeof(p_access_token_enc) is distinct from 'object' then
    raise exception 'INVALID_SECRET' using errcode = 'raise_exception';
  end if;
  if p_refresh_token_enc is not null
     and jsonb_typeof(p_refresh_token_enc) is distinct from 'object' then
    raise exception 'INVALID_SECRET' using errcode = 'raise_exception';
  end if;

  -- 3) membership + role allowlist. No existence oracle. From here: v_ws_id only.
  select m.workspace_id, m.role into v_ws_id, v_role
  from workspace_members m
  where m.workspace_id = p_workspace_id and m.user_id = v_user;
  if not found then
    raise exception 'NOT_A_MEMBER' using errcode = 'raise_exception';
  end if;
  if v_role not in ('owner', 'editor') then
    raise exception 'FORBIDDEN_ROLE' using errcode = 'raise_exception';
  end if;

  -- 4) upsert the connection; re-auth refreshes in place.
  insert into connections (
    workspace_id, platform, external_account, scopes, expires_at, status, created_by
  )
  values (v_ws_id, p_platform, p_external_account, p_scopes, p_expires_at, 'active', v_user)
  on conflict (workspace_id, platform, (external_account ->> 'id')) do update set
    external_account = excluded.external_account,
    scopes           = excluded.scopes,
    expires_at       = excluded.expires_at,
    status           = 'active'
  returning id into v_conn_id;

  -- 5) sealed material, verbatim — never a coalesce across grants.
  insert into connection_secrets (
    connection_id, access_token_enc, refresh_token_enc, token_type
  )
  values (v_conn_id, p_access_token_enc, p_refresh_token_enc, p_token_type)
  on conflict (connection_id) do update set
    access_token_enc  = excluded.access_token_enc,
    refresh_token_enc = excluded.refresh_token_enc,
    token_type        = excluded.token_type;

  return jsonb_build_object('connection_id', v_conn_id);
end;
$$;
