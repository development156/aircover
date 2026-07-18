-- ─────────────────────────────────────────────────────────────────────────────
-- Phase-A · 04 · content (posts, variants, media, publish logs, planner)
-- ─────────────────────────────────────────────────────────────────────────────

create table posts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces (id) on delete cascade,
  title text,
  body text,
  status text not null default 'draft'
    check (status in ('idea','draft','review','approved','scheduled','publishing','published','failed','expired')),
  channels text[] not null default '{}',
  scheduled_at timestamptz,
  origin text not null default 'manual' check (origin in ('manual', 'plan_week')),
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, workspace_id) -- composite-FK target for same-tenant child integrity
);
create index on posts (workspace_id);
create index on posts (workspace_id, scheduled_at);
create index on posts (workspace_id, status);

create table post_variants (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces (id) on delete cascade,
  post_id uuid not null,
  channel text not null check (channel in ('x', 'gbp', 'linkedin', 'instagram')),
  body text not null,
  extras jsonb,
  is_linked boolean not null default true,
  char_count int,
  publish_status text not null default 'pending'
    check (publish_status in ('pending','scheduled','publishing','published','failed','skipped')),
  platform_post_id text,
  permalink text,
  last_error jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (post_id, channel),
  foreign key (post_id, workspace_id) references posts (id, workspace_id) on delete cascade
);
create index on post_variants (workspace_id);
create index on post_variants (post_id);

create table post_media (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces (id) on delete cascade,
  post_id uuid not null,
  storage_path text not null,
  mime text,
  bytes int,
  width int,
  height int,
  alt text,
  meta jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (post_id, workspace_id) references posts (id, workspace_id) on delete cascade
);
create index on post_media (workspace_id);
create index on post_media (post_id);

-- Append-only: publish attempts are an immutable log.
create table post_publish_logs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces (id) on delete cascade,
  post_id uuid not null,
  variant_id uuid,
  connection_id uuid,
  channel text not null check (channel in ('x', 'gbp', 'linkedin', 'instagram')),
  attempt int not null default 1,
  status text not null check (status in ('succeeded', 'failed')),
  mode text not null default 'live' check (mode in ('live', 'fixture')),
  platform_post_id text,
  permalink text,
  error jsonb,
  job_run_id text,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  foreign key (post_id, workspace_id) references posts (id, workspace_id) on delete cascade
);
create index on post_publish_logs (workspace_id);
create index on post_publish_logs (post_id);

create table planner_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces (id) on delete cascade,
  kind text not null default 'note' check (kind in ('note', 'festival', 'custom')),
  title text not null,
  starts_at timestamptz not null,
  ends_at timestamptz,
  all_day boolean not null default false,
  post_id uuid references posts (id) on delete set null, -- soft link (plain FK; SET NULL keeps workspace_id)
  meta jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on planner_events (workspace_id);

-- RLS ------------------------------------------------------------------------
select app.apply_tenant_policies('posts');
select app.apply_tenant_policies('post_variants');
select app.apply_tenant_policies('post_media');
select app.apply_tenant_policies('planner_events');
-- publish logs: members read; inserts server-side (jobs); no update/delete.
select app.apply_tenant_read_policy('post_publish_logs');
create trigger block_mutations before update or delete on post_publish_logs
  for each row execute function app.block_mutations();

-- updated_at triggers --------------------------------------------------------
create trigger set_updated_at before update on posts
  for each row execute function app.set_updated_at();
create trigger set_updated_at before update on post_variants
  for each row execute function app.set_updated_at();
create trigger set_updated_at before update on post_media
  for each row execute function app.set_updated_at();
create trigger set_updated_at before update on planner_events
  for each row execute function app.set_updated_at();
