-- ─────────────────────────────────────────────────────────────────────────────
-- Phase-A · 02 · identity & tenancy
-- ─────────────────────────────────────────────────────────────────────────────

create table workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  created_by text not null,
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table workspace_members (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces (id) on delete cascade,
  user_id text not null,
  role text not null default 'owner' check (role in ('owner', 'editor', 'approver', 'viewer')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, user_id)
);
create index on workspace_members (workspace_id);
create index on workspace_members (user_id);

create table users_profile (
  user_id text primary key,
  email text,
  display_name text,
  avatar_url text,
  prefs jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Membership helper: security-definer so RLS on workspace_members does not recurse,
-- and so it can read the Clerk subject from the JWT (text, not uuid).
create or replace function app.member_workspace_ids() returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select workspace_id
  from workspace_members
  where user_id = (select auth.jwt() ->> 'sub');
$$;
revoke all on function app.member_workspace_ids() from public;
grant execute on function app.member_workspace_ids() to authenticated, anon;

-- RLS ------------------------------------------------------------------------
alter table workspaces enable row level security;
alter table workspace_members enable row level security;
alter table users_profile enable row level security;

-- workspaces: members see/update their own; insert + delete are server-only.
create policy ws_select on workspaces for select to authenticated
  using (id in (select app.member_workspace_ids()));
create policy ws_update on workspaces for update to authenticated
  using (id in (select app.member_workspace_ids()))
  with check (id in (select app.member_workspace_ids()));

-- workspace_members: members see rows of their workspaces; writes server-only.
create policy wm_select on workspace_members for select to authenticated
  using (workspace_id in (select app.member_workspace_ids()));

-- users_profile: a user sees/updates only their own row; insert server-only (upsert).
create policy up_select on users_profile for select to authenticated
  using (user_id = (select auth.jwt() ->> 'sub'));
create policy up_update on users_profile for update to authenticated
  using (user_id = (select auth.jwt() ->> 'sub'))
  with check (user_id = (select auth.jwt() ->> 'sub'));

-- updated_at triggers --------------------------------------------------------
create trigger set_updated_at before update on workspaces
  for each row execute function app.set_updated_at();
create trigger set_updated_at before update on workspace_members
  for each row execute function app.set_updated_at();
create trigger set_updated_at before update on users_profile
  for each row execute function app.set_updated_at();
