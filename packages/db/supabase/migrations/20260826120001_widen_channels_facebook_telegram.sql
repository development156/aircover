-- ─────────────────────────────────────────────────────────────────────────────
-- Widen the channel / platform vocabulary: add `facebook` and `telegram`
-- ─────────────────────────────────────────────────────────────────────────────
--
-- WHAT THIS DOES. Adds two values, `facebook` and `telegram`, to every place the
-- channel/platform vocabulary is enumerated in the database:
--   · ten table CHECK constraints (nine on a `channel` column, one on
--     `connections.platform`);
--   · `app.is_channel_set(text[])`, the predicate behind the CHECKs on
--     `loop_briefs.channels` and `playbook_run_items.channels`;
--   · three PL/pgSQL guards — `public.upsert_connection`,
--     `public.upsert_zernio_connection`, `public.assert_account_for_scheduled_post`.
-- Before this file the vocabulary was ['x','gbp','linkedin','instagram']; after it
-- is ['x','gbp','linkedin','instagram','facebook','telegram'].
--
-- WHY FACEBOOK AND TELEGRAM, AND WHY ONLY THESE TWO. docs/13 §6 is the register of
-- what Zernio fronts and how far each platform has actually been taken:
--   · Facebook is `[LIVE]` (docs/13 lines 213, 272): an authUrl is issued and a
--     real `client_id` is wired. It is the nearest platform to a completed connect.
--   · Telegram is `[DOC]` (docs/13 line 216): specified but not yet wired. It is
--     admitted now because it costs nothing to carry in the vocabulary and its
--     absence is what makes a connect route 500 instead of saying "coming soon".
--
-- YOUTUBE AND PINTEREST ARE DELIBERATELY EXCLUDED. This is not an oversight and a
-- follow-up must not "finish the set":
--   · YouTube is VIDEO. `PlatformSpec` (packages/shared/src/publishing/constraints.ts)
--     describes a still image only — it has `imageDims { minW, minH, aspectRange }`
--     and no duration, codec, or bitrate field. Admitting a `youtube` channel would
--     let a variant be created for a medium the publish-constraint engine cannot
--     validate, which reads as supported and silently is not.
--   · Pinterest needs a BOARD ID to publish a pin, and there is nowhere on
--     `connections`, `post_variants`, or `PlatformSpec` to hold one. A pinterest row
--     would look connected and could never target a board.
-- Each of those is its own schema change (a media spec for video, a board-id column
-- for Pinterest), not a value added to a list.
--
-- SHARED CONTRACT. `ChannelSchema`, `ConnectionPlatformSchema`, and
-- `ZERNIO_PLATFORMS` in packages/shared/src/enums.ts are the mirror of this
-- vocabulary and MUST be widened to the same six values in the same PR, or a value
-- the database now accepts is one the app still rejects at the edge. That edit lives
-- in packages/shared (frozen contracts) and is called out in this PR's summary.
--
-- IDEMPOTENT: every constraint is dropped with `if exists` before it is re-added,
-- and every function is `create or replace`. Re-running the whole file is a no-op.
--
-- APPLY ORDER: after 20260826090000_generated_body_draft_capture.sql (latest at
-- authoring). Independent of it; ordering is by timestamp only.
--
-- IF THIS FILE IS WRONG in the loose direction: a connection or variant could be
-- stored for a channel with no adapter, which reads as live and can never publish.
-- No existing row can violate the widened set — it is strictly a superset of the old
-- one, so every stored value remains legal.


-- ── 1 · The single source for the vocabulary ────────────────────────────────
-- `app.is_channel(text)` holds the list ONCE. The three PL/pgSQL guards below and
-- `app.is_channel_set` delegate to it, so the NEXT channel added to the app/RPC
-- layer is a one-line edit here rather than a change in four function bodies.
--
-- IMMUTABLE is honest: the answer depends only on the argument. That is also what
-- lets `app.is_channel_set` call it from inside a CHECK constraint.
create or replace function app.is_channel(c text) returns boolean
language sql
immutable
as $$
  select c in ('x', 'gbp', 'linkedin', 'instagram', 'facebook', 'telegram')
$$;


-- ── 2 · Why the ten table CHECKs still carry LITERALS, not app.is_channel ────
-- A CHECK of the form `check (app.is_channel(channel))` is legal in this Postgres
-- and would apply cleanly. It is NOT used, on purpose, and the reason is a test,
-- not a limitation:
--
--   `packages/db/tests/helpers/pglite-tenant.ts::literalsFor` builds the
--   tenant-isolation seed row for every `channel`/`platform` column by reading
--   `pg_get_constraintdef` and extracting the QUOTED LITERALS the CHECK mentions —
--   that is how it knows a legal value to insert. A function-call CHECK exposes no
--   literals, `literalsFor` returns `[]`, the NOT NULL channel column gets no legal
--   value, and the table is silently left UNSEEDED — so its RLS tenant isolation is
--   never proven. That exact failure is documented in that file for `loop_cycles`,
--   which went unseeded for a numeric bound the value-ladder could not satisfy.
--
-- So consolidation is applied at the FUNCTION layer (section 1, 4, 5, 6) where it is
-- invisible to that seeder, and the CHECKs keep the inline six-value list. The
-- next channel is therefore one line in `app.is_channel` PLUS a drop/re-add of these
-- ten CHECKs. That is the honest cost, and it is the price of keeping the RLS seeder
-- able to see a legal value.
--
-- Two of the ten (`templates`, `asset_usages`) allow NULL and keep the
-- `channel is null or …` shape; the other eight are NOT NULL.

alter table post_variants drop constraint if exists post_variants_channel_check;
alter table post_variants add constraint post_variants_channel_check
  check (channel in ('x', 'gbp', 'linkedin', 'instagram', 'facebook', 'telegram'));

alter table post_publish_logs drop constraint if exists post_publish_logs_channel_check;
alter table post_publish_logs add constraint post_publish_logs_channel_check
  check (channel in ('x', 'gbp', 'linkedin', 'instagram', 'facebook', 'telegram'));

alter table connections drop constraint if exists connections_platform_check;
alter table connections add constraint connections_platform_check
  check (platform in ('x', 'gbp', 'linkedin', 'instagram', 'facebook', 'telegram'));

alter table inbox_threads drop constraint if exists inbox_threads_channel_check;
alter table inbox_threads add constraint inbox_threads_channel_check
  check (channel in ('x', 'gbp', 'linkedin', 'instagram', 'facebook', 'telegram'));

alter table post_metric_snapshots drop constraint if exists post_metric_snapshots_channel_check;
alter table post_metric_snapshots add constraint post_metric_snapshots_channel_check
  check (channel in ('x', 'gbp', 'linkedin', 'instagram', 'facebook', 'telegram'));

alter table templates drop constraint if exists templates_channel_check;
alter table templates add constraint templates_channel_check
  check (channel is null or channel in ('x', 'gbp', 'linkedin', 'instagram', 'facebook', 'telegram'));

alter table asset_usages drop constraint if exists asset_usages_channel_check;
alter table asset_usages add constraint asset_usages_channel_check
  check (channel is null or channel in ('x', 'gbp', 'linkedin', 'instagram', 'facebook', 'telegram'));

alter table loop_channel_autonomy drop constraint if exists loop_channel_autonomy_channel_check;
alter table loop_channel_autonomy add constraint loop_channel_autonomy_channel_check
  check (channel in ('x', 'gbp', 'linkedin', 'instagram', 'facebook', 'telegram'));

alter table audience_snapshots drop constraint if exists audience_snapshots_channel_check;
alter table audience_snapshots add constraint audience_snapshots_channel_check
  check (channel in ('x', 'gbp', 'linkedin', 'instagram', 'facebook', 'telegram'));

alter table remix_derivatives drop constraint if exists remix_derivatives_channel_check;
alter table remix_derivatives add constraint remix_derivatives_channel_check
  check (channel in ('x', 'gbp', 'linkedin', 'instagram', 'facebook', 'telegram'));


-- ── 3 · The set predicate, delegated to app.is_channel ──────────────────────
-- `app.is_channel_set` gates `loop_briefs.channels` and `playbook_run_items.channels`
-- (both `text[]`). Rewritten to hold NO vocabulary of its own: every element must be
-- a channel and no element may repeat. The empty array still PASSES — a brief written
-- before placement is decided is a coherent intermediate state — which is why the
-- membership half is `not exists (… where not app.is_channel(e))` rather than a
-- `bool_and`, whose value over an empty set is NULL.
create or replace function app.is_channel_set(a text[]) returns boolean
language sql
immutable
as $$
  select a is not null
     and not exists (select 1 from unnest(a) as e where not app.is_channel(e))
     and cardinality(a) = (select count(distinct e) from unnest(a) as e)
$$;


-- ── 4 · public.upsert_connection — the OAuth callback write path ────────────
-- Reproduced in full; `create or replace` on a plpgsql function has no partial form.
-- The ONLY change from 20260801000001 is the platform guard, now `app.is_channel`.
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
  --    Guard now delegates to app.is_channel (facebook + telegram admitted here).
  if p_platform is null or not app.is_channel(p_platform) then
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

revoke all on function public.upsert_connection(
  uuid, text, jsonb, text[], timestamptz, jsonb, jsonb, text
) from public, anon;
grant execute on function public.upsert_connection(
  uuid, text, jsonb, text[], timestamptz, jsonb, jsonb, text
) to authenticated, service_role;


-- ── 5 · public.upsert_zernio_connection — Zernio-fronted connect ────────────
-- Reproduced in full; ONLY the platform guard changes, now `app.is_channel`.
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

  -- Still an allowlist: a channel with no adapter must never get a row that reads
  -- as an active connection. Delegates to app.is_channel (facebook + telegram).
  if p_platform is null or not app.is_channel(p_platform) then
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

  -- connection_secrets is STILL not written. Not for any of these.
  return jsonb_build_object('connection_id', v_conn_id);
end;
$$;

revoke all on function public.upsert_zernio_connection(
  uuid, text, jsonb, text, text[], timestamptz
) from public, anon;
grant execute on function public.upsert_zernio_connection(
  uuid, text, jsonb, text, text[], timestamptz
) to authenticated;


-- ── 6 · public.assert_account_for_scheduled_post — the publish-time gate ────
-- Reproduced in full; ONLY the channel guard changes, now `app.is_channel`. The
-- `c.platform = v_channel` predicate is unchanged: the connection verified must be
-- for the SAME channel as the variant, so widening the vocabulary cannot let a
-- facebook variant match a telegram connection.
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
  -- Still an allowlist; delegates to app.is_channel (facebook + telegram admitted).
  if not app.is_channel(v_channel) then
    raise exception 'INVALID_VARIANT' using errcode = 'raise_exception';
  end if;

  select profile_id into v_mapped from zernio_profiles where workspace_id = v_ws_id;
  if not found then
    raise exception 'NO_PROFILE_MAPPING' using errcode = 'raise_exception';
  end if;

  -- `c.platform = v_channel` rather than a literal: the connection must be for the
  -- SAME channel as the variant.
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
