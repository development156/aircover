-- ─────────────────────────────────────────────────────────────────────────────
-- Admin Ops · 11 · ops_* platform tables (doc 13 §3)
--
-- Platform-scope: these ten tables are the ONLY sanctioned exception to "every
-- table carries workspace_id". The amendment is mirrored into the sahoda-db
-- skill in this same commit. They still enable RLS, still expose SELECT through
-- one security-definer predicate, and still ship an anon-client test.
--
-- IDENTITY. Doc 13 §3 words the predicate as "checking ops_admins by auth.uid()".
-- Auth here is Clerk, so auth.uid() is NULL on every request and that predicate
-- would deny everyone forever. This repo's identity is auth.jwt() ->> 'sub' — a
-- Clerk subject, text — exactly as app.member_workspace_ids() reads it in
-- migration 02. That is what is used below.
--
-- WRITE PERIMETER. There are deliberately NO insert/update/delete policies on any
-- table here. Every mutation goes through a public.ops_* SECURITY DEFINER function
-- that re-checks is_ops_admin() and the caller's role, so the authorisation
-- decision lives in one place instead of thirty policy clauses. The RLS test
-- asserts that even an active owner cannot INSERT directly.
--
-- No citext. Doc 13 §3 asks for citext emails; Supabase installs extensions into
-- the `extensions` schema, which the `set search_path = public` on every function
-- below would not resolve. `text` + a unique index on lower(email) gives the same
-- case-insensitive uniqueness with nothing to resolve.
-- ─────────────────────────────────────────────────────────────────────────────

-- ops_admins (⚙ the gate itself) ----------------------------------------------
-- user_id is nullable: an owner can be seeded from ADMIN_BOOTSTRAP_EMAILS before
-- that person has ever signed in, and the Clerk user.created webhook links the
-- subject afterwards. Postgres allows many NULLs under a UNIQUE constraint, so
-- several unlinked seats coexist happily.
create table ops_admins (
  id uuid primary key default gen_random_uuid(),
  user_id text unique,
  email text not null,
  name text,
  role text not null default 'admin' check (role in ('owner', 'admin', 'viewer')),
  status text not null default 'active' check (status in ('active', 'revoked')),
  last_active_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index ops_admins_email_lower on ops_admins (lower(email));
create index on ops_admins (status);

-- ops_beta_applications --------------------------------------------------------
create table ops_beta_applications (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  business_name text not null,
  email text not null,
  phone text not null,
  source_url text,
  status text not null default 'new'
    check (status in ('new', 'contacted', 'invited', 'joined', 'rejected')),
  clerk_invitation_id text,
  clerk_user_id text,
  notes text,
  handled_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- "unique-open" (doc 13 §4): one live application per email, so a duplicate
-- submission merges instead of duplicating. Rejected applicants may re-apply
-- after 30 days and joined ones are history, so neither state is covered.
create unique index ops_beta_applications_open_email
  on ops_beta_applications (lower(email))
  where status in ('new', 'contacted', 'invited');
create index on ops_beta_applications (status);
create index on ops_beta_applications (created_at desc);

-- ops_credit_requests (maker-checker; the only ops path to the ledger) ---------
-- The 10,000 cap from doc 13 §6 is a CHECK, not a UI rule: the UI is not the
-- thing standing between an admin and the ledger.
create table ops_credit_requests (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces (id) on delete cascade,
  workspace_label text not null,
  amount int not null check (amount > 0 and amount <= 10000),
  reason text not null,
  requested_by text not null,
  approver_id text,
  otp_hash text,
  otp_expires_at timestamptz,
  attempts int not null default 0,
  self_approved boolean not null default false,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'denied', 'expired')),
  denied_reason text,
  ledger_idempotency_key text,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on ops_credit_requests (status, created_at desc);
create index on ops_credit_requests (workspace_id);

-- ops_roadmap_items ------------------------------------------------------------
create table ops_roadmap_items (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  stage text not null,
  title text not null,
  weight int not null default 1 check (weight > 0),
  status text not null default 'todo' check (status in ('todo', 'active', 'done', 'cut')),
  target_date date,
  sort int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on ops_roadmap_items (stage, sort);

-- ops_tasks --------------------------------------------------------------------
-- `column` in doc 13 §3 is a Postgres RESERVED word — `create table t (column text)`
-- is a syntax error and every later reference would need quoting. It is
-- board_column here, and in the shared zod schema that mirrors this table.
--
-- roadmap_code carries no foreign key on purpose. The board is a MIRROR of the
-- repo (doc 13 §9.7); a single mistyped code in board.json must not reject the
-- whole ingest payload and silently freeze the dashboard. Unlinked tasks are
-- surfaced in the UI instead.
create table ops_tasks (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  title text not null,
  detail text,
  doc_ref text,
  roadmap_code text,
  board_column text not null default 'todo'
    check (board_column in ('todo', 'in_progress', 'review', 'done')),
  assignee text not null default 'claude'
    check (assignee in ('claude', 'divas', 'girija', 'both')),
  blocked boolean not null default false,
  blocked_reason text,
  archived boolean not null default false,
  pr_ref text,
  commit_sha text,
  started_at timestamptz,
  review_at timestamptz,
  done_at timestamptz,
  moved_by text not null default 'claude' check (moved_by in ('claude', 'human')),
  sort int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on ops_tasks (board_column, sort);
create index on ops_tasks (roadmap_code);
create index on ops_tasks (archived);

-- ops_changelog ----------------------------------------------------------------
-- seq starts at 0 so that BOTH doc 13 §8's formula (author = authors[seq % 3])
-- and §17's acceptance criterion ("three consecutive entries read DIVAS →
-- GIRIJA → DIVAS AND GIRIJA") are true at once. A bigserial starting at 1
-- satisfies only the formula.
create sequence ops_changelog_seq as bigint start with 0 minvalue 0;

create table ops_changelog (
  id uuid primary key default gen_random_uuid(),
  seq bigint not null unique default nextval('ops_changelog_seq'),
  title text not null check (char_length(title) between 1 and 80),
  summary_plain text not null check (char_length(summary_plain) > 0),
  details_tech text,
  kind text not null default 'changed'
    check (kind in ('added', 'changed', 'fixed', 'removed', 'security', 'docs')),
  author text not null check (author in ('DIVAS', 'GIRIJA', 'DIVAS AND GIRIJA')),
  author_overridden boolean not null default false,
  task_codes text[] not null default '{}',
  tourable boolean not null default false,
  happened_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter sequence ops_changelog_seq owned by ops_changelog.seq;
create index on ops_changelog (happened_at desc);
create index on ops_changelog (seq desc);

-- ops_qa_runs ------------------------------------------------------------------
-- status 'running' doubles as the manual composer's server draft (doc 13 §11
-- autosave). Doc 13 §3 fixes the table list at ten, and 'running' was already in
-- the vocabulary, so a draft is a real run that has not reached a verdict yet —
-- which is also what it is.
create table ops_qa_runs (
  id uuid primary key default gen_random_uuid(),
  task_code text,
  kind text not null check (kind in ('auto', 'manual')),
  suite text not null
    check (suite in ('typecheck', 'lint', 'unit', 'rls', 'smoke', 'e2e', 'manual')),
  status text not null check (status in ('pass', 'fail', 'blocked', 'running')),
  summary_plain text,
  details text,
  actor text not null,
  duration_ms int,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on ops_qa_runs (task_code);
create index on ops_qa_runs (started_at desc);
create index on ops_qa_runs (suite, started_at desc);

-- ops_qa_artifacts -------------------------------------------------------------
create table ops_qa_artifacts (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references ops_qa_runs (id) on delete cascade,
  storage_path text not null unique,
  caption text,
  bytes int not null check (bytes > 0 and bytes <= 10485760),
  mime text not null check (mime in ('image/png', 'image/jpeg', 'image/webp')),
  created_at timestamptz not null default now()
);
create index on ops_qa_artifacts (run_id);

-- ops_sessions -----------------------------------------------------------------
create table ops_sessions (
  id uuid primary key default gen_random_uuid(),
  session_id text not null unique,
  label text,
  tasks_touched text[] not null default '{}',
  status text not null default 'working' check (status in ('working', 'idle', 'ended')),
  started_at timestamptz not null default now(),
  last_heartbeat_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on ops_sessions (status, last_heartbeat_at desc);

-- ops_audit_log (append-only) ---------------------------------------------------
create table ops_audit_log (
  id uuid primary key default gen_random_uuid(),
  actor text not null,
  action text not null,
  target_table text,
  target_id text,
  meta jsonb,
  created_at timestamptz not null default now()
);
create index on ops_audit_log (created_at desc);
create index on ops_audit_log (actor);

-- The gate ----------------------------------------------------------------------
-- Security-definer so it does not recurse through ops_admins' own RLS policy,
-- and so it can read the Clerk subject from the JWT. Same shape and grants as
-- app.member_workspace_ids() in migration 02. It lives in schema `app`, which is
-- not exposed to PostgREST, so it is not callable as an RPC.
create or replace function app.is_ops_admin() returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from ops_admins
    where user_id = (select auth.jwt() ->> 'sub')
      and status = 'active'
  );
$$;
revoke all on function app.is_ops_admin() from public;
grant execute on function app.is_ops_admin() to authenticated, anon;

-- RLS, triggers, realtime -------------------------------------------------------
do $$
declare
  t text;
  read_only_tables text[] := array[
    'ops_admins', 'ops_beta_applications', 'ops_credit_requests', 'ops_roadmap_items',
    'ops_tasks', 'ops_changelog', 'ops_qa_runs', 'ops_qa_artifacts', 'ops_sessions',
    'ops_audit_log'
  ];
  touched_tables text[] := array[
    'ops_admins', 'ops_beta_applications', 'ops_credit_requests', 'ops_roadmap_items',
    'ops_tasks', 'ops_changelog', 'ops_qa_runs', 'ops_sessions'
  ];
begin
  foreach t in array read_only_tables loop
    execute format('alter table %I enable row level security', t);
    execute format(
      'create policy ops_select on %I for select to authenticated using (app.is_ops_admin())', t);
  end loop;

  foreach t in array touched_tables loop
    execute format(
      'create trigger set_updated_at before update on %I '
      'for each row execute function app.set_updated_at()', t);
  end loop;
end $$;

create trigger block_mutations before update or delete on ops_audit_log
  for each row execute function app.block_mutations();

-- The changelog author rotation is assigned server-side from the global sequence,
-- so it is deterministic no matter who or what writes the entry (doc 13 §8). A
-- manually supplied author survives and is flagged, and it does NOT shift the
-- cycle because the sequence is consumed either way.
create or replace function app.ops_changelog_set_author() returns trigger
language plpgsql as $$
begin
  if new.author is null then
    -- seq is bigint; the explicit int cast keeps the subscript out of
    -- assignment-cast territory rather than relying on it.
    new.author := (array['DIVAS', 'GIRIJA', 'DIVAS AND GIRIJA'])[((new.seq % 3) + 1)::int];
  else
    new.author_overridden := true;
  end if;
  return new;
end;
$$;
create trigger ops_changelog_set_author before insert on ops_changelog
  for each row execute function app.ops_changelog_set_author();

-- Realtime: the dashboard watches cards move while Claude works (doc 13 §9.6).
-- Guarded because a project without the Supabase realtime publication should
-- still take this migration.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime
      add table ops_tasks, ops_changelog, ops_qa_runs, ops_sessions;
  end if;
end $$;
