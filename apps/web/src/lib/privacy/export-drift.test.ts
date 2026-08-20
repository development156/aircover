/**
 * Does the export manifest still match the database?
 *
 * ## Why this test exists and why it is allowed to skip
 *
 * The manifest is a hand-written file describing a fact about the schema. Facts
 * about the schema change. A table added next month is silently missing from
 * every export, and the export still says "everything you own" — which is the
 * one claim it must never make falsely, because the person reading it cannot
 * check.
 *
 * So this asks the live database the same question the manifest was built from,
 * and PRINTS the difference rather than merely failing. Without a database URL
 * it SKIPS, loudly — the sandbox has no `.env` and a test that failed there
 * would be red for a reason that is not a defect, which is how a suite gets
 * ignored. A skip is honest; a green pass without a connection would not be.
 *
 * It is read-only: one `select` against `information_schema` and `pg_policies`.
 */
import { createRequire } from 'node:module'

import { describe, it, expect } from 'vitest'

import { EXPORT_TABLES } from './export-manifest'

const DB_URL = process.env.SUPABASE_DB_URL ?? ''
const describeWithDb = DB_URL === '' ? describe.skip : describe

/** Both questions the manifest encodes, in one round trip. */
const SCHEMA_QUERY = `
  select c.table_name,
         exists (
           select 1 from pg_policies p
           where p.schemaname = 'public'
             and p.tablename = c.table_name
             and p.cmd in ('SELECT', 'ALL')
         ) as has_read_policy
    from information_schema.columns c
    join information_schema.tables t
      on t.table_schema = c.table_schema
     and t.table_name = c.table_name
     and t.table_type = 'BASE TABLE'
   where c.table_schema = 'public'
     and c.column_name = 'workspace_id'
   order by c.table_name
`

describeWithDb('the export manifest against the live schema', () => {
  /**
   * The three methods this test uses, and nothing else.
   *
   * `apps/web` depends on `pg` but not on `@types/pg` (only `packages/db` has
   * those), so a bare `import('pg')` is an implicit `any` and typecheck refuses
   * it. Declaring the narrow surface here is the alternative to adding a
   * dependency for one test — and a structural type that names three methods is
   * a better description of what this file needs than the whole client API.
   */
  interface MinimalPgClient {
    connect(): Promise<void>
    query(sql: string): Promise<{ rows: Array<{ table_name: string; has_read_policy: boolean }> }>
    end(): Promise<void>
  }
  interface MinimalPgModule {
    Client: new (config: {
      connectionString: string
      ssl: { rejectUnauthorized: boolean }
    }) => MinimalPgClient
  }

  async function readSchema(): Promise<Array<{ table_name: string; has_read_policy: boolean }>> {
    // `createRequire`, not `await import('pg')`. `apps/web` has `pg` but not
    // `@types/pg`, and a bare dynamic import is TS7016 (implicit any module) at
    // the import expression itself — a cast afterwards cannot reach it. require()
    // is typed to return `any` by design, so the narrowing below is the ONLY
    // type assertion in play and it is written out above rather than inferred.
    const require = createRequire(import.meta.url)
    const pg = require('pg') as MinimalPgModule
    const client = new pg.Client({
      connectionString: DB_URL,
      ssl: { rejectUnauthorized: false },
    })
    await client.connect()
    try {
      await client.query('set default_transaction_read_only = on')
      const result = await client.query(SCHEMA_QUERY)
      return result.rows
    } finally {
      await client.end()
    }
  }

  it('knows about every workspace-owned table, and invents none', async () => {
    const rows = await readSchema()
    const inDb = rows.map((r) => r.table_name).sort()
    const inManifest = EXPORT_TABLES.map((t) => t.table).sort()

    const missing = inDb.filter((t) => !inManifest.includes(t))
    const phantom = inManifest.filter((t) => !inDb.includes(t))

    // Named, not counted. "1 table differs" sends someone hunting; the name
    // sends them to the fix.
    expect(
      missing,
      `these tables carry workspace_id and are NOT in the export manifest, so they are missing from every export: ${missing.join(', ')}`,
    ).toEqual([])
    expect(
      phantom,
      `the manifest lists tables that do not exist or do not carry workspace_id: ${phantom.join(', ')}`,
    ).toEqual([])
  }, 30_000)

  it('classifies readability the way the policies actually do', async () => {
    const rows = await readSchema()
    const wrong: string[] = []

    for (const row of rows) {
      const entry = EXPORT_TABLES.find((t) => t.table === row.table_name)
      if (!entry) continue
      const expected = row.has_read_policy ? 'readable' : 'no-read-policy'
      if (entry.readability !== expected) {
        wrong.push(
          `${row.table_name}: manifest says ${entry.readability}, policies say ${expected}`,
        )
      }
    }

    // This is the one that catches the silent case. A table that LOSES its read
    // policy starts answering [] instead of erroring, and without this the
    // export would begin quietly claiming the customer has no such rows.
    expect(wrong, wrong.join(' · ')).toEqual([])
  }, 30_000)
})
