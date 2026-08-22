#!/usr/bin/env node
/**
 * pgbox — a REAL, throwaway PostgreSQL with this repository's whole schema on it.
 *
 * ── THE PROBLEM THIS SOLVES ──────────────────────────────────────────────────
 * This account has exactly ONE Supabase project and it is production: 26 live
 * workspaces, 17 real users. `tests/helpers/forbidden-target.ts` refuses it BY REF,
 * and is right to. The consequence was that every suite which needs to WRITE — 26
 * integration tests in @sahoda/billing, the ledger and lifecycle suites here — had
 * no database it was permitted to open, and so had never executed once. They did not
 * fail; `describe.skipIf` reported them as passing suites that ran nothing, which is
 * indistinguishable from green in the summary line.
 *
 * Two of them were broken the whole time. `migration_integrity` declared a table named
 * `as` (a quoted command tag read as a declaration) and could not have passed against
 * ANY database. Nothing noticed, because nothing ran it.
 *
 * ── WHY IT INSTALLS ITS OWN POSTGRES ─────────────────────────────────────────
 * `embedded-postgres` ships a real PostgreSQL binary (~100 MB). Adding it to
 * package.json would put that in every install, in CI, and in the lockfile, for a tool
 * a developer reaches for occasionally. So it is installed on demand into a directory
 * OUTSIDE the workspace, and `pnpm-lock.yaml` never moves.
 *
 * PGlite (already a devDependency) is the right tool for the `*.pglite.test.ts` suites,
 * which drive SQL in-process. It cannot serve this case: the billing integration suites
 * connect over TCP with a connection string, which PGlite has no way to answer.
 *
 * ── USAGE ────────────────────────────────────────────────────────────────────
 *   node packages/db/scripts/pgbox.mjs up       # boot + apply every migration
 *   node packages/db/scripts/pgbox.mjs down     # stop
 *   node packages/db/scripts/pgbox.mjs env      # exports for packages/db + packages/billing
 *   node packages/db/scripts/pgbox.mjs env-web  # exports for apps/web
 *
 * Then, and note the DISTINCT variable name:
 *
 *   eval "$(node packages/db/scripts/pgbox.mjs env)"
 *   pnpm vitest run --root packages/billing
 *
 * ── WHY apps/web GETS A DIFFERENT SET ────────────────────────────────────────
 * `env` BLANKS the Supabase URL and keys, so the RLS suites skip instead of failing on a
 * refused fetch. Feeding that same set to apps/web breaks five tests in `lib/env.test.ts`,
 * which asserts that a valid environment parses — a blank `NEXT_PUBLIC_SUPABASE_URL` is
 * exactly the invalid case it is built to reject. Those failures are the harness talking,
 * not the code. apps/web needs only the box URL, so `env-web` emits only that.
 *
 * `SAHODA_PGBOX_URL` is deliberately not `SUPABASE_DB_URL`: both that and `DATABASE_URL`
 * are set in the repo environment and both name production, so a gate reading either
 * could be satisfied by a variable simply existing. Nothing sets this one by accident.
 */
import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { tmpdir } from 'node:os'
import { createRequire } from 'node:module'

const HERE = dirname(fileURLToPath(import.meta.url))
const MIGRATIONS = resolve(HERE, '../supabase/migrations')

const BOX = process.env.SAHODA_PGBOX_HOME ?? join(tmpdir(), 'sahoda-pgbox')
const DATA = join(BOX, 'data')
const PORT = Number(process.env.SAHODA_PGBOX_PORT ?? 54329)
const URL = `postgres://postgres:postgres@127.0.0.1:${PORT}/postgres`

const log = (...a) => console.error(...a)

/** Install embedded-postgres + pg into BOX, outside the workspace. Idempotent. */
function ensureDeps() {
  mkdirSync(BOX, { recursive: true })
  const pkg = join(BOX, 'package.json')
  if (!existsSync(pkg)) {
    writeFileSync(pkg, JSON.stringify({ name: 'sahoda-pgbox', private: true, type: 'module' }))
  }
  if (!existsSync(join(BOX, 'node_modules', 'embedded-postgres'))) {
    log('pgbox: installing a PostgreSQL binary (once, ~100 MB)…')
    execFileSync('npm', ['install', '--no-audit', '--no-fund', 'embedded-postgres', 'pg'], {
      cwd: BOX,
      stdio: 'inherit',
    })
  }
  return createRequire(join(BOX, 'noop.js'))
}

const binDir = () => join(BOX, 'node_modules', '@embedded-postgres', 'linux-x64', 'native', 'bin')

function pgctl(args, opts = {}) {
  return spawnSync(join(binDir(), 'pg_ctl'), args, { encoding: 'utf8', ...opts })
}

function isRunning() {
  if (!existsSync(join(DATA, 'PG_VERSION'))) return false
  return pgctl(['-D', DATA, 'status']).status === 0
}

/**
 * The objects a Supabase project already has before migration 01 runs. Without these a
 * bare PostgreSQL fails on line 9 of `20260718000001_helpers.sql`.
 *
 * `auth.jwt()` reads the same GUC Supabase's does, so the RLS policies exercised here are
 * the SHIPPED policies driven by a real claim — not a re-implementation that could agree
 * with a bug.
 */
const PREAMBLE = `
create extension if not exists pgcrypto;

do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon')
    then create role anon nologin noinherit; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated')
    then create role authenticated nologin noinherit; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role')
    then create role service_role nologin noinherit bypassrls; end if;
end $$;
grant anon, authenticated, service_role to postgres;

create schema if not exists auth;
create schema if not exists extensions;
grant usage on schema auth to anon, authenticated, service_role;

create or replace function auth.jwt() returns jsonb language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb)
$$;

create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(auth.jwt() ->> 'sub', '')::uuid
$$;

create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  email text,
  created_at timestamptz not null default now()
);

-- Supabase Storage, reduced to what the migrations touch. Nothing in billing reads it;
-- it exists so no migration is left unapplied and the schema under test is the whole one.
create schema if not exists storage;
grant usage on schema storage to anon, authenticated, service_role;

create table if not exists storage.buckets (
  id text primary key,
  name text not null,
  public boolean not null default false,
  file_size_limit bigint,
  allowed_mime_types text[],
  created_at timestamptz not null default now()
);

create table if not exists storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text references storage.buckets(id),
  name text,
  owner uuid,
  metadata jsonb,
  created_at timestamptz not null default now()
);
alter table storage.objects enable row level security;

create or replace function storage.foldername(name text) returns text[] language sql immutable as $$
  select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1]
$$;

create or replace function storage.filename(name text) returns text language sql immutable as $$
  select (string_to_array(name, '/'))[array_length(string_to_array(name, '/'), 1)]
$$;

create or replace function storage.extension(name text) returns text language sql immutable as $$
  select (string_to_array(storage.filename(name), '.'))[
    array_length(string_to_array(storage.filename(name), '.'), 1)]
$$;
`

async function up() {
  const require = ensureDeps()

  if (!existsSync(join(DATA, 'PG_VERSION'))) {
    log('pgbox: initialising cluster…')
    rmSync(DATA, { recursive: true, force: true })
    mkdirSync(DATA, { recursive: true })
    const pwfile = join(BOX, 'pw')
    writeFileSync(pwfile, 'postgres')
    execFileSync(
      join(binDir(), 'initdb'),
      ['-D', DATA, '-U', 'postgres', '-A', 'password', `--pwfile=${pwfile}`, '-E', 'UTF8'],
      { stdio: 'inherit' },
    )
    rmSync(pwfile, { force: true })
  }

  if (!isRunning()) {
    // Daemonised on purpose: a server that dies with its parent cannot serve a separate
    // `vitest` process, which is the entire point of the box.
    const r = pgctl([
      '-D',
      DATA,
      '-l',
      join(BOX, 'pg.log'),
      '-o',
      `-p ${PORT} -k /tmp`,
      '-w',
      'start',
    ])
    if (r.status !== 0) {
      log(r.stdout ?? '', r.stderr ?? '')
      log(existsSync(join(BOX, 'pg.log')) ? readFileSync(join(BOX, 'pg.log'), 'utf8') : '')
      process.exit(1)
    }
  }
  log(`pgbox: postgres listening on ${PORT}`)

  const { Pool } = require('pg')
  const pool = new Pool({
    host: '127.0.0.1',
    port: PORT,
    user: 'postgres',
    password: 'postgres',
    database: 'postgres',
  })

  const client = await pool.connect()
  const failures = []
  try {
    await client.query(PREAMBLE)
    await client.query(
      'create table if not exists _pgbox_applied (name text primary key, at timestamptz default now())',
    )
    const done = new Set(
      (await client.query('select name from _pgbox_applied')).rows.map((r) => r.name),
    )

    const files = readdirSync(MIGRATIONS)
      .filter((f) => f.endsWith('.sql'))
      .sort()
    let applied = 0
    for (const f of files) {
      if (done.has(f)) {
        applied += 1
        continue
      }
      const sql = readFileSync(join(MIGRATIONS, f), 'utf8')
      try {
        // One transaction per migration, so a failure leaves NOTHING of that file behind
        // and the box never sits in a half-applied state that later tests read as real.
        await client.query('begin')
        await client.query(sql)
        await client.query('insert into _pgbox_applied(name) values ($1)', [f])
        await client.query('commit')
        applied += 1
      } catch (e) {
        await client.query('rollback')
        failures.push({ f, msg: String(e.message).split('\n')[0] })
      }
    }
    log(`pgbox: migrations applied ${applied}/${files.length}`)
    for (const x of failures) log(`  FAIL ${x.f}: ${x.msg}`)
  } finally {
    client.release()
    await pool.end()
  }

  if (failures.length > 0) process.exit(1)
  printEnv()
}

function down() {
  if (!existsSync(join(DATA, 'PG_VERSION'))) return log('pgbox: nothing to stop')
  pgctl(['-D', DATA, '-m', 'fast', '-w', 'stop'], { stdio: 'inherit' })
  log('pgbox: stopped')
}

/**
 * Every variable in forbidden-target's TARGET_VARS is emitted, because the suites' dotenv
 * load fills in whatever is UNSET from the repo-root file — and that file names production.
 * Miss one and the destination guard fires. The Supabase URL/keys are blanked rather than
 * pointed somewhere: this box runs Postgres and no PostgREST, so the RLS suites must SKIP
 * rather than fail on a refused fetch.
 */
function printEnv() {
  process.stdout.write(
    [
      `export SAHODA_PGBOX_URL='${URL}'`,
      `export SAHODA_ALLOW_LIVE_TESTS=1`,
      `export SUPABASE_DB_URL='${URL}'`,
      `export DATABASE_URL='${URL}'`,
      `export SUPABASE_PROJECT_REF='pgbox-throwaway'`,
      `export NEXT_PUBLIC_SUPABASE_URL=''`,
      `export SUPABASE_URL=''`,
      `export NEXT_PUBLIC_SUPABASE_ANON_KEY=''`,
      `export SUPABASE_ANON_KEY=''`,
      `export SUPABASE_SERVICE_ROLE_KEY=''`,
      `export SUPABASE_JWT_SECRET=''`,
      '',
    ].join('\n'),
  )
}

/** apps/web needs the box URL and NOTHING else — see the note at the top of this file. */
function printWebEnv() {
  process.stdout.write(`export SAHODA_PGBOX_URL='${URL}'\n`)
}

const cmd = process.argv[2] ?? 'up'
if (cmd === 'up') await up()
else if (cmd === 'down') down()
else if (cmd === 'env') printEnv()
else if (cmd === 'env-web') printWebEnv()
else {
  log('usage: pgbox.mjs [up|down|env|env-web]')
  process.exit(2)
}
