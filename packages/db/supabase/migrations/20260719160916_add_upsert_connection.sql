-- ─────────────────────────────────────────────────────────────────────────────
-- public.upsert_connection — the OAuth callback write path (requested by wt-web).
--
-- `connections` has conn_select/conn_update/conn_delete but NO INSERT policy, and
-- `connection_secrets` has RLS enabled with ZERO policies on purpose (service-role
-- only). apps/web has no service-role client by design, so this SECURITY DEFINER
-- function is the one client-reachable write into both — same shape and security
-- model as public.bootstrap_workspace and public.resolve_brand_memory.
--
-- Security model (mirrors resolve_brand_memory):
--   · identity comes from auth.jwt()->>'sub' only — never from arguments;
--   · owned by the migration role, so it bypasses RLS exactly like the other
--     definer helpers (the sanctioned server-side write path);
--   · lives in `public` so PostgREST exposes it, but EXECUTE is revoked from
--     public/anon and granted to authenticated only;
--   · every argument is validated here — any signed-in user can call it directly
--     with arbitrary arguments, so the guards are the trust boundary;
--   · membership resolves p_workspace_id into v_ws_id and NOTHING below reads the
--     argument again, so a cross-tenant write is structurally impossible.
--
-- ── THE SEALED-SECRET MAPPING (wt-pub review finding #1, settled here) ─────────
--
-- packages/publishing's ConnectionStore port hands its caller ONE opaque
-- `encryptedSecret` string, while connection_secrets has TWO jsonb columns. Three
-- mappings were possible; one is not actually possible at all:
--
--   ✗ "the RPC splits the envelope" — IMPOSSIBLE, not merely unwanted. Both tokens
--     are sealed inside a SINGLE AES-256-GCM ciphertext under one auth tag, and the
--     vault key lives only in the Node process (TOKEN_VAULT_KEY). Postgres cannot
--     see inside `data`, so no SQL can separate them. Only @sahoda/publishing can.
--
--   ✓ CHOSEN — the function takes TWO sealed blobs, one per column, and treats each
--     as opaque. This is wt-web's requested signature verbatim and their recommended
--     option (A): wt-pub seals twice, so `ConnectionUpsert` carries
--     accessTokenEnc + refreshTokenEnc and each column holds what its name says.
--
--   ~ It ALSO survives option (B) unchanged: a caller that still has one bundled
--     envelope passes it as p_access_token_enc with p_refresh_token_enc => null.
--     That works, but then access_token_enc holds access AND refresh material and
--     its name lies — so (B) is a fallback, not the target. Choosing the two-blob
--     signature means the DB never has to change whichever way wt-pub goes, and
--     wt-db is not blocking on an edit to a shipped wt-pub interface.
--
-- The blobs are jsonb because the columns are, and because storing the envelope as
-- an OBJECT (not an opaque string) lets a future key-rotation job find rows by
-- `access_token_enc ->> 'key_version'` without decrypting anything — the rotation
-- runbook in 03_TSD §3 needs exactly that. The mount therefore JSON.parses the
-- sealed string once to hand it over; that is not "opening" the envelope (no field
-- is read, nothing is logged) and the port's verbatim-storage rule still holds.
--
-- This function NEVER inspects, parses, logs, returns or raises token material. The
-- only shape guard is jsonb_typeof(...) = 'object', which reads no field.
--
-- Invariants that look like easy "improvements" but each break something:
--   · guards run BEFORE any write, and membership before the upsert — otherwise an
--     authenticated stranger can probe or touch another tenant's rows;
--   · the role test is an ALLOWLIST, deliberately narrower than
--     resolve_brand_memory's: binding a real external account that can post as the
--     business is an integration action, not a content action, so `approver` and
--     `viewer` are excluded. Widening later is safe; narrowing later breaks people;
--   · secrets are written VERBATIM, including a null refresh. Do NOT "improve" this
--     into coalesce(p_refresh_token_enc, connection_secrets.refresh_token_enc): the
--     access and refresh material must come from the SAME grant, and pairing a new
--     access token with a refresh token from a previous authorization is how you get
--     a connection that silently cannot refresh;
--   · created_by is preserved on re-auth — it records who first connected the
--     account, not who most recently re-authed it;
--   · neither upsert sets updated_at: the set_updated_at BEFORE UPDATE triggers on
--     both tables already do, and ON CONFLICT DO UPDATE fires them;
--   · no advisory lock, unlike resolve_brand_memory. That one serializes a
--     read-then-write on max(version); here INSERT ... ON CONFLICT DO UPDATE is
--     atomic against the unique index, so a lock would only add contention. Two
--     concurrent callbacks for the same account converge on one row and the later
--     secret wins — both are valid credentials for the same grant.
--
-- Error vocabulary (all SQLSTATE P0001; consumers substring-match the message):
--   AUTH_REQUIRED · INVALID_WORKSPACE · INVALID_PLATFORM · INVALID_ACCOUNT
--   INVALID_SECRET · NOT_A_MEMBER · FORBIDDEN_ROLE
-- Returns: { "connection_id": "<uuid>" } — metadata only, never token material.
-- ─────────────────────────────────────────────────────────────────────────────

comment on column connection_secrets.access_token_enc is
  'ONE vault-sealed AES-256-GCM envelope {iv,tag,data,key_version} for the ACCESS '
  'token, written only by public.upsert_connection. Opaque to SQL: never parsed, '
  'logged, or returned to a client. key_version is queryable for key rotation. '
  'Under the fallback mapping (B) this may hold a bundle of access+refresh — see '
  'the migration that created upsert_connection.';

comment on column connection_secrets.refresh_token_enc is
  'ONE vault-sealed envelope for the REFRESH token, or NULL when the platform '
  'issued none. Written verbatim per grant — never merged with a previous grant''s '
  'refresh token. Same opacity rules as access_token_enc.';

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

  -- 2) boundary validation. Every guard is NULL-total: PostgREST forwards an
  --    explicit JSON null verbatim (only an OMITTED argument takes the default),
  --    and a comparison against NULL is NULL — never true — so `is distinct from`
  --    and `is null` are used throughout rather than a bare <> / =.
  --    This vocabulary is ConnectionPlatformSchema, which is deliberately NOT the
  --    Channel set (Channel includes 'instagram'); it must match the table CHECK.
  if p_platform is null or p_platform not in ('x', 'gbp', 'linkedin') then
    raise exception 'INVALID_PLATFORM' using errcode = 'raise_exception';
  end if;

  -- external_account->>'id' is the third term of connections_ws_platform_account.
  -- A null there would not fail — it would silently create a SECOND connection on
  -- every re-auth instead of refreshing the first, because NULLs are distinct in a
  -- unique index. That is why this is a hard guard and not a nicety.
  if jsonb_typeof(p_external_account) is distinct from 'object' then
    raise exception 'INVALID_ACCOUNT' using errcode = 'raise_exception';
  end if;
  v_account_id := nullif(btrim(coalesce(p_external_account ->> 'id', '')), '');
  if v_account_id is null then
    raise exception 'INVALID_ACCOUNT' using errcode = 'raise_exception';
  end if;

  -- Shape-only check on the sealed blobs: an object, nothing more. Reading a field
  -- would be inspecting the envelope, which is @sahoda/publishing's business alone.
  -- jsonb_typeof also rejects a JSON null literal ('null'), which a bare NOT NULL
  -- column check would have accepted and stored as a useless non-secret.
  if jsonb_typeof(p_access_token_enc) is distinct from 'object' then
    raise exception 'INVALID_SECRET' using errcode = 'raise_exception';
  end if;
  if p_refresh_token_enc is not null
     and jsonb_typeof(p_refresh_token_enc) is distinct from 'object' then
    raise exception 'INVALID_SECRET' using errcode = 'raise_exception';
  end if;

  -- 3) membership + role allowlist. A non-member gets NOT_A_MEMBER whether or not
  --    the workspace exists — no existence oracle. From here on: v_ws_id only.
  select m.workspace_id, m.role into v_ws_id, v_role
  from workspace_members m
  where m.workspace_id = p_workspace_id and m.user_id = v_user;
  if not found then
    raise exception 'NOT_A_MEMBER' using errcode = 'raise_exception';
  end if;
  if v_role not in ('owner', 'editor') then
    raise exception 'FORBIDDEN_ROLE' using errcode = 'raise_exception';
  end if;

  -- 4) upsert the connection. Re-auth of the same account REFRESHES in place:
  --    scopes/expiry/account metadata are replaced and status returns to 'active'
  --    (a previously 'expired' or 'revoked' connection is live again), so a repeated
  --    callback returns the same connection_id instead of raising.
  insert into connections (
    workspace_id, platform, external_account, scopes, expires_at, status, created_by
  )
  values (v_ws_id, p_platform, p_external_account, p_scopes, p_expires_at, 'active', v_user)
  on conflict (workspace_id, platform, (external_account ->> 'id')) do update set
    external_account = excluded.external_account,
    scopes           = excluded.scopes,
    expires_at       = excluded.expires_at,
    status           = 'active'
    -- created_by intentionally NOT updated: first connector, not latest re-auth
  returning id into v_conn_id;

  -- 5) upsert the sealed material, verbatim. See the header on why this is not a
  --    coalesce: access and refresh must always come from the same grant.
  insert into connection_secrets (
    connection_id, access_token_enc, refresh_token_enc, token_type
  )
  values (v_conn_id, p_access_token_enc, p_refresh_token_enc, p_token_type)
  on conflict (connection_id) do update set
    access_token_enc  = excluded.access_token_enc,
    refresh_token_enc = excluded.refresh_token_enc,
    token_type        = excluded.token_type;

  -- metadata only — a token must never leave this function
  return jsonb_build_object('connection_id', v_conn_id);
end;
$$;

-- Client-reachable by design — but only for signed-in members. The signature must
-- be spelled in full or the revoke/grant silently targets nothing. The service_role
-- grant is inert today (no JWT ⇒ AUTH_REQUIRED); it mirrors bootstrap_workspace and
-- resolve_brand_memory and must NOT be "fixed" with a p_actor argument — identity
-- stays JWT-derived.
revoke all on function public.upsert_connection(
  uuid, text, jsonb, text[], timestamptz, jsonb, jsonb, text
) from public, anon;
grant execute on function public.upsert_connection(
  uuid, text, jsonb, text[], timestamptz, jsonb, jsonb, text
) to authenticated, service_role;
