-- ─────────────────────────────────────────────────────────────────────────────
-- Phase-A · 05 · connections (OAuth) + token vault
-- ─────────────────────────────────────────────────────────────────────────────

create table connections (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces (id) on delete cascade,
  platform text not null check (platform in ('x', 'gbp', 'linkedin')),
  status text not null default 'active' check (status in ('active', 'expired', 'revoked', 'error')),
  external_account jsonb not null,
  scopes text[],
  expires_at timestamptz,
  last_checked_at timestamptz,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, platform, (external_account ->> 'id'))
);
create index on connections (workspace_id);

-- Token vault: RLS enabled, ZERO policies ⇒ only the service role can touch it.
-- Tokens decrypt in job/server memory only, never logged or returned.
create table connection_secrets (
  connection_id uuid primary key references connections (id) on delete cascade,
  access_token_enc jsonb not null,
  refresh_token_enc jsonb,
  token_type text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table connection_secrets enable row level security;
-- (no policies on purpose: deny-all for anon/authenticated; service role bypasses RLS)

-- connections: members manage their connections; insert server-side (OAuth callback).
alter table connections enable row level security;
create policy conn_select on connections for select to authenticated
  using (workspace_id in (select app.member_workspace_ids()));
create policy conn_update on connections for update to authenticated
  using (workspace_id in (select app.member_workspace_ids()))
  with check (workspace_id in (select app.member_workspace_ids()));
create policy conn_delete on connections for delete to authenticated
  using (workspace_id in (select app.member_workspace_ids()));

create trigger set_updated_at before update on connections
  for each row execute function app.set_updated_at();
create trigger set_updated_at before update on connection_secrets
  for each row execute function app.set_updated_at();
