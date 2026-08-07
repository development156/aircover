-- ─────────────────────────────────────────────────────────────────────────────
-- Phase-A · 07 · sites & leads
-- ─────────────────────────────────────────────────────────────────────────────

create table sites (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces (id) on delete cascade,
  name text not null,
  slug text not null unique, -- the {slug}.sahoda.site subdomain
  goal text,
  status text not null default 'draft'
    check (status in ('draft', 'deploying', 'published', 'failed', 'unpublished')),
  theme jsonb,
  deploy jsonb,
  last_deployed_at timestamptz,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, workspace_id)
);
create index on sites (workspace_id);

create table site_pages (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces (id) on delete cascade,
  site_id uuid not null,
  path text not null default '/',
  title text,
  sort int not null default 0,
  seo jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (site_id, path),
  unique (id, workspace_id),
  foreign key (site_id, workspace_id) references sites (id, workspace_id) on delete cascade
);
create index on site_pages (workspace_id);
create index on site_pages (site_id);

create table site_sections (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces (id) on delete cascade,
  page_id uuid not null,
  kind text not null check (kind in ('hero', 'features', 'offer', 'testimonials', 'faq', 'contact')),
  sort int not null default 0,
  content jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (page_id, workspace_id) references site_pages (id, workspace_id) on delete cascade
);
create index on site_sections (workspace_id);
create index on site_sections (page_id);

create table leads (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces (id) on delete cascade,
  site_id uuid references sites (id) on delete set null, -- soft link
  name text,
  email text,
  phone text,
  message text,
  payload jsonb,
  source jsonb,
  status text not null default 'new' check (status in ('new', 'contacted', 'qualified', 'won', 'lost')),
  read_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on leads (workspace_id);

-- RLS ------------------------------------------------------------------------
select app.apply_tenant_policies('sites');
select app.apply_tenant_policies('site_pages');
select app.apply_tenant_policies('site_sections');
-- leads: members read + update (status / read); inserts are server-only (the public
-- form route validates + Turnstile-checks then inserts with the service role).
alter table leads enable row level security;
create policy leads_select on leads for select to authenticated
  using (workspace_id in (select app.member_workspace_ids()));
create policy leads_update on leads for update to authenticated
  using (workspace_id in (select app.member_workspace_ids()))
  with check (workspace_id in (select app.member_workspace_ids()));

create trigger set_updated_at before update on sites
  for each row execute function app.set_updated_at();
create trigger set_updated_at before update on site_pages
  for each row execute function app.set_updated_at();
create trigger set_updated_at before update on site_sections
  for each row execute function app.set_updated_at();
create trigger set_updated_at before update on leads
  for each row execute function app.set_updated_at();
