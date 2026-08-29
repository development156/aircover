import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { resolve } from 'node:path'
import { hasLedgerEnv } from './helpers/env'
import { pgPool } from './helpers/db'

/**
 * Does a migration do what its name says it does?
 *
 * TWICE IN ONE DAY a migration file was created by `supabase migration new`,
 * left at 0 bytes because the command that was supposed to fill it timed out,
 * and then applied. The first time it reached the database: `db push` exited 0,
 * wrote the version to `schema_migrations`, and every layer above reported
 * success while `public.ops_ingest` did not exist. A future push would have
 * skipped that version forever.
 *
 * Nothing in the stack compared what a migration CLAIMS to create against what
 * is actually there. These two checks do (SL-035).
 *
 * Part one needs no database and therefore always runs — including in the
 * credential-free cloud sandbox, which is exactly where a silent empty
 * migration would otherwise sail through the Stop gate.
 */

const MIGRATIONS = resolve(import.meta.dirname, '../supabase/migrations')

function migrationFiles(): string[] {
  return readdirSync(MIGRATIONS)
    .filter((name) => name.endsWith('.sql'))
    .sort()
}

/**
 * Statements a migration declares. Names only — enough to look them up.
 *
 * ── WHY STRING LITERALS ARE REMOVED, NOT JUST COMMENTS ───────────────────────
 * `20260801000000_rls_auto_enable.sql` compares an event trigger's command tag against
 * the literal list `('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')`. That is live
 * SQL, not a comment, so comment-stripping alone left it in — and the table regex read
 * `'CREATE TABLE AS'` as a DECLARATION of a table called `as`.
 *
 * Nothing named `as` can ever exist, so the catalog check below could not pass against
 * ANY database, production included. It looked healthy only because it had never run:
 * it gates on `hasLedgerEnv`, and until a non-production Postgres existed there was no
 * database the suite was permitted to open. MEASURED 2026-08-20: `missingTables: ['as']`.
 *
 * A literal can never contain a real declaration, so removing them cannot hide one.
 */
function declaredObjects(sql: string) {
  const strip = sql
    .split('\n')
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n')
    // Single-quoted literals, doubled '' escapes included, replaced by an empty pair so
    // surrounding statements keep their shape.
    .replace(/'(?:[^']|'')*'/g, "''")

  return {
    tables: [...strip.matchAll(/\bcreate\s+table\s+(?:if\s+not\s+exists\s+)?([a-z_][a-z0-9_]*)/gi)]
      .map((m) => m[1]!.toLowerCase())
      .filter((name) => name !== 'if'),
    functions: [
      ...strip.matchAll(
        /\bcreate\s+(?:or\s+replace\s+)?function\s+(app|public)\.([a-z_][a-z0-9_]*)/gi,
      ),
    ].map((m) => `${m[1]!.toLowerCase()}.${m[2]!.toLowerCase()}`),
  }
}

describe('every migration file has content', () => {
  const files = migrationFiles()

  it('finds migrations to check at all', () => {
    // Without this the suite would pass vacuously if the directory moved.
    expect(files.length).toBeGreaterThan(10)
  })

  it.each(files)('%s is not empty', (name) => {
    // The exact failure, twice: `supabase migration new` creates the file, the
    // command meant to fill it dies, and an empty migration is applied and
    // recorded as done.
    const bytes = statSync(resolve(MIGRATIONS, name)).size
    expect(bytes).toBeGreaterThan(0)
  })

  it.each(files)('%s contains at least one statement', (name) => {
    // A file of only comments is empty in every sense that matters and would
    // pass a byte check.
    const sql = readFileSync(resolve(MIGRATIONS, name), 'utf8')
    const executable = sql
      .split('\n')
      .filter((line) => line.trim() !== '' && !line.trim().startsWith('--'))
      .join('')
      .trim()

    expect(executable.length).toBeGreaterThan(0)
  })
})

/**
 * The parser that feeds the catalog check, tested WITHOUT a database.
 *
 * The catalog check itself gates on `hasLedgerEnv`, so for as long as no permitted
 * Postgres existed a broken parser sat undetected — and it was broken: it declared a
 * table named `as`, which nothing could ever satisfy. These run everywhere, so the
 * next such break fails in the sandbox rather than waiting for a database.
 */
describe('the declaration parser reads statements, not string literals', () => {
  it('does not mistake a quoted command tag for a table declaration', () => {
    const sql = `
      create table real_one (id uuid primary key);
      create or replace function app.f() returns trigger language plpgsql as $$
      begin
        if tg_tag in ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO') then
          return null;
        end if;
      end;
      $$;
    `

    const found = declaredObjects(sql)

    expect(found.tables).toEqual(['real_one'])
    expect(found.functions).toEqual(['app.f'])
  })

  it('still finds every real declaration across the actual migrations', () => {
    const tables = new Set<string>()
    for (const name of migrationFiles()) {
      for (const t of declaredObjects(readFileSync(resolve(MIGRATIONS, name), 'utf8')).tables) {
        tables.add(t)
      }
    }

    // Anchored on tables this repository cannot lose. A parser that stripped too much
    // would pass the test above and fail here.
    expect(tables).toContain('workspaces')
    expect(tables).toContain('credit_ledger')
    expect(tables).toContain('invoices')
    expect(tables).toContain('invoice_serials')
    // The defect this parser had, named so a regression is unmistakable.
    expect(tables).not.toContain('as')
  })
})

/**
 * Part two: the objects the applied migrations name must exist.
 *
 * Needs a real connection, so it gates on `hasLedgerEnv` like every other live
 * suite here. That is the honest trade — it cannot run in the sandbox, which is
 * why part one exists and does not depend on it.
 */
describe.skipIf(!hasLedgerEnv)('applied migrations created what they declare', () => {
  it('every declared table and function is in the catalog', async () => {
    const declared = { tables: new Set<string>(), functions: new Set<string>() }

    for (const name of migrationFiles()) {
      const found = declaredObjects(readFileSync(resolve(MIGRATIONS, name), 'utf8'))
      for (const table of found.tables) declared.tables.add(table)
      for (const fn of found.functions) declared.functions.add(fn)
    }

    expect(declared.tables.size).toBeGreaterThan(0)
    expect(declared.functions.size).toBeGreaterThan(0)

    const pool = pgPool()
    try {
      const tables = await pool.query<{ tablename: string }>(
        `select tablename from pg_tables where schemaname = 'public'`,
      )
      const functions = await pool.query<{ fq: string }>(
        `select n.nspname || '.' || p.proname as fq
         from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname in ('app', 'public')`,
      )

      const liveTables = new Set(tables.rows.map((r) => r.tablename))
      const liveFunctions = new Set(functions.rows.map((r) => r.fq))

      // Reported as lists, not as a count, so a failure names the object that is
      // missing instead of saying a number moved.
      const missingTables = [...declared.tables].filter((t) => !liveTables.has(t))
      const missingFunctions = [...declared.functions].filter((f) => !liveFunctions.has(f))

      expect({ missingTables, missingFunctions }).toEqual({
        missingTables: [],
        missingFunctions: [],
      })
    } finally {
      await pool.end()
    }
  })
})

/**
 * ── TWO MIGRATIONS MAY NOT CLAIM THE SAME INSTANT ────────────────────────────
 *
 * `20260828100000_loop_reflect_reason.sql` and `20260828100000_studio_designs.sql`
 * were written by two lanes on the same day and carry the SAME timestamp. Nothing
 * in this repository noticed, which is the actual defect: the ordering between
 * them is then decided by whatever the applier happens to sort by, and a pair
 * that is independent today stops being independent the moment one of them
 * depends on the other's table.
 *
 * ── WHY THE EXISTING PAIR IS AN EXCEPTION AND NOT A RENAME ───────────────────
 * Renaming a migration is safe only while it is UNAPPLIED. Once applied, the
 * filename is a row in `supabase_migrations.schema_migrations`, and renaming it
 * makes the applier treat it as a new migration and run it a second time.
 *
 * Whether these two are applied CANNOT BE ESTABLISHED from a sandbox: the
 * Supabase MCP server is down (`CONNECTION_CLOSED`, MEASURED 2026-08-29) and
 * `db.<ref>.supabase.co` resolves AAAA-only with no IPv6 route from here, so
 * there is no path to the catalog that would answer it. Renaming on a guess is
 * the one action here that could break production, so it is not taken. A person
 * with database access resolves the pair; this guard makes sure no THIRD one
 * joins them quietly in the meantime.
 *
 * ── THE EXCEPTION INVALIDATES ITSELF ─────────────────────────────────────────
 * The third test below fails if the known pair STOPS colliding. An allowance
 * that outlives the thing it allows is how a guard rots into a rubber stamp,
 * so removing the collision forces removing the exception in the same commit.
 */
const KNOWN_TIMESTAMP_COLLISION = '20260828100000'

function timestampsOf(files: string[]): Map<string, string[]> {
  const byStamp = new Map<string, string[]>()
  for (const name of files) {
    const stamp = name.slice(0, 14)
    byStamp.set(stamp, [...(byStamp.get(stamp) ?? []), name])
  }
  return byStamp
}

describe('no two migrations share a timestamp', () => {
  it('scans a plausible number of migrations, so an empty scan cannot excuse everything', () => {
    // The guard that stops this whole describe becoming vacuous. A glob that
    // silently matched nothing would make every assertion below pass.
    expect(migrationFiles().length).toBeGreaterThan(80)
  })

  it('finds no collision other than the one already known', () => {
    const collisions = [...timestampsOf(migrationFiles()).entries()]
      .filter(([, names]) => names.length > 1)
      .filter(([stamp]) => stamp !== KNOWN_TIMESTAMP_COLLISION)
      .map(([stamp, names]) => `${stamp}: ${names.join(', ')}`)

    expect(
      collisions,
      'Two migrations claim the same instant. Their order is then whatever the ' +
        'applier sorts by. Bump one timestamp before it is applied anywhere.',
    ).toEqual([])
  })

  it('the known collision is still a collision, so the exception cannot outlive it', () => {
    const names = timestampsOf(migrationFiles()).get(KNOWN_TIMESTAMP_COLLISION) ?? []
    expect(
      names.length,
      `${KNOWN_TIMESTAMP_COLLISION} no longer collides. Delete KNOWN_TIMESTAMP_COLLISION ` +
        'in the same commit that resolved it.',
    ).toBeGreaterThan(1)
  })
})
