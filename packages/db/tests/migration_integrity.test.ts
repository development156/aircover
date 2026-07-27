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

/** Statements a migration declares. Names only — enough to look them up. */
function declaredObjects(sql: string) {
  const strip = sql
    .split('\n')
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n')

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
