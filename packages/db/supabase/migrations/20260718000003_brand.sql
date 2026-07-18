-- ─────────────────────────────────────────────────────────────────────────────
-- Phase-A · 03 · brand (Brand Brain)
-- ─────────────────────────────────────────────────────────────────────────────

create table brand_memory (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces (id) on delete cascade,
  version int not null,
  status text not null check (status in ('active', 'superseded', 'draft')),
  payload jsonb not null,
  source text not null check (source in ('resolved', 'manual', 'system')),
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, version)
);
create index on brand_memory (workspace_id);
-- at most one active version per workspace
create unique index brand_memory_one_active
  on brand_memory (workspace_id) where status = 'active';

create table memory_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces (id) on delete cascade,
  source text not null check (source in ('insight', 'user', 'calibration', 'system')),
  diff jsonb not null,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'rejected', 'auto')),
  evidence_refs jsonb,
  applied_memory_version int,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on memory_events (workspace_id);

-- Members read only. All writes (new versions, supersede, accept/reject) are
-- server-side so a member can never destroy the living memory or tamper a diff.
select app.apply_tenant_read_policy('brand_memory');
select app.apply_tenant_read_policy('memory_events');

create trigger set_updated_at before update on brand_memory
  for each row execute function app.set_updated_at();
create trigger set_updated_at before update on memory_events
  for each row execute function app.set_updated_at();
