-- ─────────────────────────────────────────────────────────────────────────────
-- Phase-A · 08 · experience (themes, tours) + ops (ai/audit/settings)
-- ─────────────────────────────────────────────────────────────────────────────

create table workspace_themes (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces (id) on delete cascade,
  version int not null,
  tokens jsonb not null,
  source text not null check (source in ('default', 'extracted', 'manual')),
  diff_log jsonb,
  status text not null check (status in ('proposed', 'active', 'reverted', 'archived')),
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, version)
);
create index on workspace_themes (workspace_id);
create unique index workspace_themes_one_active
  on workspace_themes (workspace_id) where status = 'active';
select app.apply_tenant_policies('workspace_themes');
create trigger set_updated_at before update on workspace_themes
  for each row execute function app.set_updated_at();

-- guide_tours (⚙ platform content; not tenant-scoped; hot-updatable) ----------
create table guide_tours (
  id uuid primary key default gen_random_uuid(),
  slug text not null,
  locale text not null default 'en',
  version int not null,
  definition jsonb not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (slug, locale)
);
alter table guide_tours enable row level security;
create policy tours_select on guide_tours for select to authenticated using (active);
create trigger set_updated_at before update on guide_tours
  for each row execute function app.set_updated_at();

-- tour_progress (👤 user-scoped) ----------------------------------------------
create table tour_progress (
  user_id text not null,
  workspace_id uuid not null references workspaces (id) on delete cascade,
  tour_slug text not null,
  version int not null,
  step int not null default 0,
  status text not null default 'active'
    check (status in ('active', 'completed', 'skipped', 'dismissed', 'remind_later')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, workspace_id, tour_slug)
);
create index on tour_progress (workspace_id);
alter table tour_progress enable row level security;
create policy tp_all on tour_progress for all to authenticated
  using (
    user_id = (select auth.jwt() ->> 'sub')
    and workspace_id in (select app.member_workspace_ids())
  )
  with check (
    user_id = (select auth.jwt() ->> 'sub')
    and workspace_id in (select app.member_workspace_ids())
  );
create trigger set_updated_at before update on tour_progress
  for each row execute function app.set_updated_at();

-- ai_provider_logs (⚙ service-only; margin telemetry; append-only) ------------
create table ai_provider_logs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces (id) on delete cascade,
  task text not null,
  tier text,
  provider text,
  model text,
  tokens_in int,
  tokens_out int,
  cached_tokens int,
  cost_usd numeric(10, 6),
  latency_ms int,
  credits_charged int,
  status text check (status in ('ok', 'error', 'fallback')),
  error_code text,
  trace_id text,
  created_at timestamptz not null default now()
);
create index on ai_provider_logs (workspace_id);
alter table ai_provider_logs enable row level security;
-- (no policies: service-only — raw COGS is margin data, not user-facing)
create trigger block_mutations before update or delete on ai_provider_logs
  for each row execute function app.block_mutations();

-- audit_logs (member read; insert server-only; append-only) -------------------
create table audit_logs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces (id) on delete cascade,
  actor text not null,
  action text not null,
  target jsonb,
  meta jsonb,
  trace_id text,
  created_at timestamptz not null default now()
);
create index on audit_logs (workspace_id);
select app.apply_tenant_read_policy('audit_logs');
create trigger block_mutations before update or delete on audit_logs
  for each row execute function app.block_mutations();

-- app_settings (⚙ service-only) ----------------------------------------------
create table app_settings (
  key text primary key,
  value jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table app_settings enable row level security;
-- (no policies: service-only)
create trigger set_updated_at before update on app_settings
  for each row execute function app.set_updated_at();
