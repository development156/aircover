-- Everything Supabase creates BEFORE the first migration runs.
--
-- ONE COPY, read by every harness that boots this schema on PGlite:
--   packages/db/tests/helpers/pglite-tenant.ts
--   packages/billing/src/test-helpers/pglite-pool.ts
--   apps/jobs/tests/helpers/db-under-test.ts
--
-- It was briefly three copies of the same TypeScript template literal, which is
-- the shape a schema drifts in: one gets a role or a stub the others do not, and
-- the packages then disagree about what "the real schema" means while all three
-- report green. A .sql file read from disk cannot drift from itself.
--
-- The `storage` half is a STUB and is here only because two migrations write
-- policies against `storage.objects` and will not apply without it. Nothing in
-- any suite reads a storage row, so it decides nothing.
--
-- The GRANTs are NOT here: they must run AFTER the migrations have created the
-- tables. See each harness.
  create role authenticated;
  create role anon;
  create role service_role;

  create schema if not exists auth;
  create schema if not exists storage;
  grant usage on schema auth, storage to authenticated, anon, service_role;

  create or replace function auth.jwt() returns jsonb language sql stable as $$
    select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb
  $$;
  create or replace function auth.uid() returns uuid language sql stable as $$
    select nullif(auth.jwt() ->> 'sub', '')::uuid
  $$;

  create table storage.buckets (
    id text primary key, name text, public boolean default false,
    file_size_limit bigint, allowed_mime_types text[],
    created_at timestamptz default now());
  create table storage.objects (
    id uuid primary key default gen_random_uuid(),
    bucket_id text references storage.buckets(id),
    name text, owner uuid, metadata jsonb,
    created_at timestamptz default now());
  alter table storage.objects enable row level security;
  create or replace function storage.foldername(name text) returns text[]
    language sql immutable as $$ select string_to_array(name, '/') $$;
