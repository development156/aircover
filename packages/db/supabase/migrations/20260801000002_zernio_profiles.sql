-- ─────────────────────────────────────────────────────────────────────────────
-- Slice B · 02 · zernio_profiles — the workspace ↔ Zernio profile mapping, 1:1
--
-- Doc 13 §4: "Profile → Workspace, 1:1". Doc 13 §3: "Profiles are organisational,
-- not authorisational" — Zernio validates an accountId against the whole TEAM, not
-- against the profile in the request. There is no server-side tenant boundary on
-- their publish. This table is the first half of ours; the second half is
-- 20260801000004_assert_account_in_workspace_profile.sql.
--
-- WHY A TABLE AND NOT A COLUMN ON workspaces.
-- The 1:1 must be enforced in BOTH directions and a column enforces neither well:
--   · workspace_id as PRIMARY KEY  ⇒ one workspace cannot hold two profiles
--   · profile_id  as UNIQUE        ⇒ one profile cannot serve two workspaces
-- A nullable column on `workspaces` gives the first only with a partial index and
-- the second not at all. The direction that actually matters is the second one:
-- two workspaces sharing a profile is the shape of a cross-tenant publish.
--
-- WHY THE DEFAULT PROFILE IS DENIED BY LITERAL.
-- Zernio auto-creates a profile named "Default" per team. Observed [LIVE] on
-- 2026-07-29 and again 2026-07-31: 6a69d2ac81d9920d149afc18. Every workspace that
-- ever "falls back to Default" collides on ONE profile, which is precisely the
-- cross-tenant condition this table exists to prevent — and it would look like
-- success, because Zernio publishes happily to it.
-- Recorded as a literal on purpose, the same reasoning as
-- packages/db/tests/helpers/forbidden-target.ts:31: reading it from configuration
-- would mean configuration could also unset it. If this ever has to be relaxed,
-- relax it by naming a new allowed id — never by deleting the check.
-- ─────────────────────────────────────────────────────────────────────────────

create table zernio_profiles (
  workspace_id uuid primary key references workspaces (id) on delete cascade,

  -- 24-char lowercase hex. Doc 13 §1 [LIVE]: Zernio ids are Mongo-style ObjectIds,
  -- NOT uuids. The regex is a real guard, not decoration — a uuid pasted here would
  -- be accepted by a plain `text` column and then never match anything Zernio
  -- returns, producing a workspace that silently cannot publish.
  profile_id text not null unique
    check (profile_id ~ '^[0-9a-f]{24}$'),

  -- The Default-profile denylist. See header.
  constraint zernio_profiles_not_default_profile
    check (profile_id <> '6a69d2ac81d9920d149afc18'),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table zernio_profiles is
  'Workspace ↔ Zernio profile, 1:1 in both directions (workspace_id PK, profile_id '
  'UNIQUE). Zernio profiles organise but do NOT authorise (doc 13 §3), so this '
  'mapping is the tenant boundary for publishing and is security-critical.';

-- workspace_id is the PK so it is already indexed; profile_id is UNIQUE so it is
-- already indexed. No additional index is warranted — both lookup directions are
-- covered and an extra index would only be write cost.

alter table zernio_profiles enable row level security;

-- Members may SEE their workspace's mapping (the connections page shows it).
create policy zernio_profiles_select on zernio_profiles for select to authenticated
  using (workspace_id in (select app.member_workspace_ids()));

-- Deliberately NO insert/update/delete policies. Same model as `connections`:
-- the only write path is the SECURITY DEFINER function below, so the role
-- allowlist and the Default-profile denylist cannot be bypassed by a member with
-- a raw PostgREST client.

create trigger set_updated_at before update on zernio_profiles
  for each row execute function app.set_updated_at();

-- ─────────────────────────────────────────────────────────────────────────────
-- public.ensure_zernio_profile — the ONLY write path into zernio_profiles.
--
-- Identity from auth.jwt() only. Membership resolved into v_ws_id, and nothing
-- below reads the argument again — the same structural pattern as
-- upsert_connection, for the same reason.
--
-- Idempotent by design: binding the SAME profile again returns the existing row
-- rather than raising, so a user who re-runs the connect flow is not punished for
-- it. Binding a DIFFERENT profile to a workspace that already has one RAISES —
-- silently repointing a workspace at another profile is exactly how a tenant
-- boundary moves without anyone noticing.
--
-- Errors (SQLSTATE P0001): AUTH_REQUIRED · INVALID_WORKSPACE · INVALID_PROFILE ·
-- NOT_A_MEMBER · FORBIDDEN_ROLE · PROFILE_ALREADY_BOUND · PROFILE_IN_USE
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.ensure_zernio_profile(
  p_workspace_id uuid,
  p_profile_id   text
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
  v_existing text;
begin
  v_user := auth.jwt() ->> 'sub';
  if v_user is null or v_user = '' then
    raise exception 'AUTH_REQUIRED' using errcode = 'raise_exception';
  end if;

  if p_workspace_id is null then
    raise exception 'INVALID_WORKSPACE' using errcode = 'raise_exception';
  end if;

  -- Shape and denylist are enforced HERE as well as by the table constraints.
  -- The constraint is the backstop; this is the guard that produces a readable
  -- error instead of a raw 23514 check violation.
  if p_profile_id is null or p_profile_id !~ '^[0-9a-f]{24}$' then
    raise exception 'INVALID_PROFILE' using errcode = 'raise_exception';
  end if;
  if p_profile_id = '6a69d2ac81d9920d149afc18' then
    raise exception 'INVALID_PROFILE' using errcode = 'raise_exception';
  end if;

  select m.workspace_id, m.role into v_ws_id, v_role
  from workspace_members m
  where m.workspace_id = p_workspace_id and m.user_id = v_user;
  if not found then
    raise exception 'NOT_A_MEMBER' using errcode = 'raise_exception';
  end if;
  -- Same allowlist as upsert_connection: binding an external identity that can
  -- post as the business is an integration action, not a content action.
  if v_role not in ('owner', 'editor') then
    raise exception 'FORBIDDEN_ROLE' using errcode = 'raise_exception';
  end if;

  select profile_id into v_existing from zernio_profiles where workspace_id = v_ws_id;
  if found then
    if v_existing = p_profile_id then
      return jsonb_build_object('workspace_id', v_ws_id, 'profile_id', v_existing,
                                'created', false);
    end if;
    raise exception 'PROFILE_ALREADY_BOUND' using errcode = 'raise_exception';
  end if;

  -- The UNIQUE index is the real guarantee; this converts its 23505 into a named
  -- error. Checked AFTER membership so a non-member learns nothing about which
  -- profiles exist.
  if exists (select 1 from zernio_profiles where profile_id = p_profile_id) then
    raise exception 'PROFILE_IN_USE' using errcode = 'raise_exception';
  end if;

  insert into zernio_profiles (workspace_id, profile_id)
  values (v_ws_id, p_profile_id);

  return jsonb_build_object('workspace_id', v_ws_id, 'profile_id', p_profile_id,
                            'created', true);
end;
$$;

revoke all on function public.ensure_zernio_profile(uuid, text) from public, anon;
grant execute on function public.ensure_zernio_profile(uuid, text) to authenticated;
