-- ─────────────────────────────────────────────────────────────────────────────
-- Slice B · 03 · public.upsert_zernio_connection — the tokenless write path
--
-- WHY A SIBLING AND NOT A RELAXATION OF upsert_connection.
-- upsert_connection requires a sealed access token: `jsonb_typeof(
-- p_access_token_enc) is distinct from 'object'` raises INVALID_SECRET. That guard
-- is correct and load-bearing for x/gbp/linkedin, where a connection without a
-- credential is a connection that cannot publish and must never be recorded as
-- 'active'.
--
-- A Zernio connection has no token AT ALL. Doc 13 §7 and FINDINGS Finding 1
-- [LIVE]: the Instagram authUrl carries client_id=1387147079198980 and
-- redirect_uri=https://zernio.com/api/v1/connect/instagram/callback — both
-- Zernio's. The user consents to Zernio; Zernio holds the Meta token; our app
-- never sees one. So `connections` is about to hold two different KINDS of row:
--   · x/gbp/linkedin — a credential WE hold, with a mandatory connection_secrets row
--   · instagram      — a reference to an account ZERNIO holds, with NO secret row
--
-- Loosening upsert_connection to accept a null secret would weaken the guard for
-- the three platforms that need it, in order to serve the one that does not. This
-- function is the alternative: same identity, membership and role model, writes
-- `connections` ONLY, and NEVER references connection_secrets — not with a null,
-- not at all. A grep for `connection_secrets` in this file returns only this
-- comment, and a test asserts exactly that.
--
-- Errors (SQLSTATE P0001): AUTH_REQUIRED · INVALID_WORKSPACE · INVALID_PLATFORM ·
-- INVALID_ACCOUNT · INVALID_PROFILE · NO_PROFILE_MAPPING · PROFILE_MISMATCH ·
-- NOT_A_MEMBER · FORBIDDEN_ROLE
-- Returns: { "connection_id": "<uuid>" } — metadata only.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.upsert_zernio_connection(
  p_workspace_id     uuid,
  p_platform         text,
  p_external_account jsonb,   -- { id, profileId, name?, handle? } — id is Zernio's account _id
  p_profile_id       text,    -- the caller's claim; verified against the mapping, never trusted
  p_scopes           text[] default null,
  p_expires_at       timestamptz default null   -- Zernio's tokenExpiresAt (doc 13 §2.5, 60 days)
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
  -- 1) identity from the JWT, never from arguments
  v_user := auth.jwt() ->> 'sub';
  if v_user is null or v_user = '' then
    raise exception 'AUTH_REQUIRED' using errcode = 'raise_exception';
  end if;

  if p_workspace_id is null then
    raise exception 'INVALID_WORKSPACE' using errcode = 'raise_exception';
  end if;

  -- 2) boundary validation, NULL-total throughout.
  --    Only Zernio-fronted platforms may use this path. x/gbp/linkedin hold real
  --    credentials and must keep going through upsert_connection, which forces a
  --    sealed secret — routing them here would create an 'active' connection with
  --    no token, i.e. a connection that looks live and cannot publish.
  if p_platform is null or p_platform not in ('instagram') then
    raise exception 'INVALID_PLATFORM' using errcode = 'raise_exception';
  end if;

  if jsonb_typeof(p_external_account) is distinct from 'object' then
    raise exception 'INVALID_ACCOUNT' using errcode = 'raise_exception';
  end if;

  -- external_account->>'id' is the third term of connections_ws_platform_account.
  -- A null there would not fail — it would silently create a SECOND connection on
  -- every re-auth, because NULLs are distinct in a unique index.
  -- Zernio account ids are 24-char hex (doc 13 §1 [LIVE], "Not UUIDs").
  v_account_id := nullif(btrim(coalesce(p_external_account ->> 'id', '')), '');
  if v_account_id is null or v_account_id !~ '^[0-9a-f]{24}$' then
    raise exception 'INVALID_ACCOUNT' using errcode = 'raise_exception';
  end if;

  if p_profile_id is null or p_profile_id !~ '^[0-9a-f]{24}$' then
    raise exception 'INVALID_PROFILE' using errcode = 'raise_exception';
  end if;

  -- 3) membership + role allowlist. No existence oracle: a non-member gets
  --    NOT_A_MEMBER whether or not the workspace exists. From here: v_ws_id only.
  select m.workspace_id, m.role into v_ws_id, v_role
  from workspace_members m
  where m.workspace_id = p_workspace_id and m.user_id = v_user;
  if not found then
    raise exception 'NOT_A_MEMBER' using errcode = 'raise_exception';
  end if;
  if v_role not in ('owner', 'editor') then
    raise exception 'FORBIDDEN_ROLE' using errcode = 'raise_exception';
  end if;

  -- 4) THE TENANT BOUNDARY. The profile is re-derived from the mapping for the
  --    workspace we just resolved from the JWT — p_profile_id is only ever
  --    COMPARED, never used to look anything up. A caller who passes another
  --    tenant's profile id gets PROFILE_MISMATCH; a caller who passes the right
  --    one has told us nothing we did not already know.
  select profile_id into v_mapped from zernio_profiles where workspace_id = v_ws_id;
  if not found then
    raise exception 'NO_PROFILE_MAPPING' using errcode = 'raise_exception';
  end if;
  if v_mapped is distinct from p_profile_id then
    raise exception 'PROFILE_MISMATCH' using errcode = 'raise_exception';
  end if;

  -- 5) The stored account carries the MAPPED profile, not the argument. If the two
  --    ever diverge the row records the boundary we enforced, so the layer-3
  --    re-derivation in migration 04 cannot be fooled by a row that lied on the
  --    way in.
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
    -- created_by intentionally NOT updated: first connector, not latest re-auth
  returning id into v_conn_id;

  -- 6) connection_secrets is NOT written. Not with a null, not with a placeholder.
  --    There is no token to store: Zernio holds it (doc 13 §7).

  return jsonb_build_object('connection_id', v_conn_id);
end;
$$;

revoke all on function public.upsert_zernio_connection(
  uuid, text, jsonb, text, text[], timestamptz
) from public, anon;
grant execute on function public.upsert_zernio_connection(
  uuid, text, jsonb, text, text[], timestamptz
) to authenticated;
