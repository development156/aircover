-- ═══════════════════════════════════════════════════════════════════════════
-- CONNECTING IS NOT PUBLISHING, AND THIS MIGRATION IS THE FIRST TIME THAT
-- DISTINCTION COSTS ANYTHING.
--
-- `packages/shared/src/enums.ts` has carried two enums since the Zernio work
-- began, with a comment insisting they must not be collapsed:
--
--   Channel             what Sahoda can PUBLISH to
--   ConnectionPlatform  what Sahoda can hold a BINDING for
--
-- They held the same six values, so the warning was theoretical. It is not any
-- more. Eight platforms landed on 2026-08-26 that a customer can link and that
-- Sahoda cannot post to:
--
--   discord  pinterest  reddit  slack  threads  tiktok  whatsapp  youtube
--
-- MEASURED, not read off documentation. Each was probed once against the live
-- API, `GET /v1/connect/{platform}?profileId=…` with a real profile id, and each
-- answered HTTP 200 carrying an `authUrl`. The probe was not ceremony:
-- `docs.zernio.com/llms-full.txt` lists `x`, `mastodon`, `medium` and `substack`
-- as connectable — all four answer 400 `platform_not_supported` — and omits
-- `reddit`, `slack` and `googlebusiness`, which all answer 200.
--
-- ── WHY THIS TOUCHES ONE TABLE AND THE LAST ONE TOUCHED TEN ────────────────
-- `20260826120000_widen_channels_facebook_telegram.sql` added two CHANNELS, so
-- it had to widen the CHECK on all ten tables that carry a `channel` column plus
-- `app.is_channel_set` plus four PL/pgSQL guards. This adds no channel at all.
-- `app.is_channel` is UNCHANGED at six values and every publishing table's CHECK
-- is untouched, deliberately: a connect-only platform has no adapter, so no code
-- path can put it in `post_variants`, `post_publish_logs`, `inbox_threads` or any
-- of the rest, and widening those would remove the guarantee rather than add one.
--
-- The narrow blast radius is the payoff for keeping the two vocabularies apart.
-- It is not a shortcut.
--
-- ── IF THIS FILE IS WRONG ──────────────────────────────────────────────────
-- In the TIGHT direction: a customer completes a real OAuth grant at, say,
-- Reddit, and `upsert_zernio_connection` raises INVALID_PLATFORM. The return
-- route reports it as a write failure with a 5xx — loudly and honestly — but the
-- grant at the platform is real and cannot be undone, so the cost lands on them.
--
-- In the LOOSE direction: a row could exist for a platform with no adapter. That
-- is the intended state, and it is safe because `CONSTRAINTS` is keyed by
-- `Channel`: the composer cannot offer what has no `PlatformSpec`, so such a row
-- can be read and displayed and never scheduled against.
--
-- No existing row can violate the widened set. It is strictly a superset of the
-- old one, so every stored value remains legal.
-- ═══════════════════════════════════════════════════════════════════════════


-- ── 1 · The connection vocabulary, held once ───────────────────────────────
-- Deliberately a SECOND predicate rather than a widened `app.is_channel`. The
-- publishing guards — `assert_account_for_scheduled_post`, `publish_claim` — must
-- keep answering "no" for these eight, and they answer through `app.is_channel`.
-- Widening that one function would have quietly admitted all eight to every
-- publishing path in the database, which is the exact conflation this migration
-- exists to make impossible.
--
-- IMMUTABLE is honest: the answer depends only on the argument.
create or replace function app.is_connection_platform(p text) returns boolean
language sql
immutable
as $$
  select p in (
    -- The six that are also channels. Kept as literals rather than delegated to
    -- `app.is_channel`, because a superset relationship that holds today is not
    -- one the next editor should have to preserve by hand: if `app.is_channel`
    -- ever narrows, this list must not narrow with it.
    'x', 'gbp', 'linkedin', 'instagram', 'facebook', 'telegram',
    -- The eight that are not.
    'discord', 'pinterest', 'reddit', 'slack', 'threads', 'tiktok',
    'whatsapp', 'youtube'
  )
$$;

comment on function app.is_connection_platform(text) is
  'True for a platform a workspace may hold a connection to. Strictly wider than app.is_channel: publishing needs a measured PlatformSpec and linking does not.';


-- ── 2 · The table CHECK keeps its INLINE literals, and that is not sloppiness ─
-- `packages/db/tests/helpers/pglite-tenant.ts::literalsFor` builds the
-- tenant-isolation seed row for every `platform` column by reading
-- `pg_get_constraintdef` and extracting the QUOTED LITERALS the CHECK mentions.
-- A `check (app.is_connection_platform(platform))` exposes no literals,
-- `literalsFor` returns `[]`, the NOT NULL column gets no legal value, and
-- `connections` is silently left UNSEEDED — so its RLS tenant isolation stops
-- being proven, while every test still passes.
--
-- That is the failure this project has already been bitten by on `loop_cycles`.
-- So consolidation lives at the function layer, where the seeder cannot see it,
-- and this CHECK carries the list in full.
alter table connections drop constraint if exists connections_platform_check;
alter table connections add constraint connections_platform_check
  check (platform in (
    'x', 'gbp', 'linkedin', 'instagram', 'facebook', 'telegram',
    'discord', 'pinterest', 'reddit', 'slack', 'threads', 'tiktok',
    'whatsapp', 'youtube'
  ));


-- ── 3 · ONE of the two write paths into `connections` ──────────────────────
-- `upsert_zernio_connection` widens. `upsert_connection` deliberately does NOT,
-- and that is a decision rather than an oversight: it is the NATIVE path, the one
-- that seals an OAuth token into `connection_secrets`. None of the eight has a
-- native flow — they all go through Zernio, which holds the credential — so a
-- call reaching it for `tiktok` would mean a code path nobody wrote. It keeps
-- `app.is_channel` and keeps refusing them.

-- COPIED VERBATIM from `20260826120000`, with ONE line changed and marked below.
-- Not paraphrased, and the first draft of this file proves why that rule is real:
-- writing the body from memory produced a plausible function that dropped the
-- PROFILE_MISMATCH tenant-boundary check, dropped the `^[0-9a-f]{24}$` validation
-- on both ids, returned `id` where every caller reads `connection_id`, and — worst
-- — omitted the `p_scopes` parameter, so it would have CREATED AN OVERLOAD beside
-- the old function instead of replacing it, leaving PostgREST to choose between
-- two. Every one of those would have typechecked, applied cleanly and been wrong.

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

  -- ── THE ONE LINE THIS MIGRATION CHANGES ─────────────────────────────────
  -- Still an allowlist. It delegated to `app.is_channel`, which asks "can Sahoda
  -- PUBLISH here" — the wrong question for a function whose entire job is
  -- recording that a customer linked an account. The eight connect-only
  -- platforms are legal here and remain illegal everywhere a post is written,
  -- because `app.is_channel` is untouched and the publishing guards still use it.
  if p_platform is null or not app.is_connection_platform(p_platform) then
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

comment on function public.upsert_zernio_connection(uuid, text, jsonb, text, text[], timestamptz) is
  'Records an account Zernio holds. Accepts any connection platform, including the eight Sahoda cannot publish to. Publishing tables remain gated on app.is_channel.';
