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
 * and PRINTS the difference rather than merely failing. Without a database it
 * SKIPS, loudly — a test that failed there would be red for a reason that is
 * not a defect, which is how a suite gets ignored. A skip is honest; a green
 * pass without a connection would not be.
 *
 * ── "WITHOUT A DATABASE" MEANS TWO THINGS, AND USED TO MEAN ONE ─────────────
 * Until 2026-08-28 the only condition was an empty `SUPABASE_DB_URL`, which was
 * right when the sandbox had no `.env`. `scripts/cloud-setup.sh` changed that on
 * 2026-08-24: the sandbox now HAS the credential and still has no route to the
 * host, so this file was hard red on `wt-core` for a reason no code could fix.
 * It now also skips when the connection is never established — and ONLY then.
 * Anything the server answers with, including a rejected password or a denied
 * `select`, stays red. `lib/testing/db-reachability.ts` draws that line and is
 * itself checked on every gate run; read its header before widening it.
 *
 * It is read-only: one `select` against `information_schema` and `pg_policies`,
 * inside a `begin read only` — see the note on that below, which is the reason
 * this file could be pointed at production at all.
 *
 * ── IT HAD NEVER RUN, AND WHAT NOW COVERS THAT ──────────────────────────────
 * Written 2026-08-19 and first EXECUTED 2026-08-23, against production, from a
 * worktree that had `SUPABASE_DB_URL`. Four days in which the only guard on the
 * export manifest was one that never fired — and eight tables went missing from
 * every export in that window.
 *
 * `packages/db/tests/export_manifest.pglite.test.ts` now asks the same two
 * questions of the MIGRATION FILES, in process, with no credentials, on every
 * gate run. It cannot speak for production. It catches the thing that actually
 * goes stale, and it caught `ledger_actor_redactions` on the first gate run
 * after that table was written — by name, without anybody looking.
 *
 * This file remains the ONLY thing that can say what production holds, so it is
 * kept, fixed, and run by hand when somebody has the credential.
 *
 * ── WHAT IT SAID ABOUT PRODUCTION, 2026-08-23 ───────────────────────────────
 * `missing` was EMPTY: every workspace-owned table in production is in the
 * manifest, and the readability assertion passed too. So the eight tables found
 * on 2026-08-22 were the last of them, and the manifest is currently true of the
 * live database as well as of the migration files.
 *
 * `phantom` named `ledger_actor_redactions` — which is correct and expected. It
 * is created by `20260823000000_dpdp_erasure.sql`, which is written and
 * deliberately NOT applied. This file will report it until somebody applies that
 * migration, and that red is the unapplied migration, not a defect in the
 * manifest. It costs nothing at runtime: the entry is `no-read-policy`, so
 * `buildWorkspaceExport` never queries the table and lists it by name instead.
 */
import { createRequire } from 'node:module'
import { resolve } from 'node:path'

import { splitPhantoms, tablesCreatedByMigrations } from '@/lib/privacy/pending-tables'

import { describe, it, expect } from 'vitest'
import type { TestContext } from 'vitest'

import { unreachableCode } from '../testing/db-reachability'
import { EXPORT_TABLES } from './export-manifest'

const MIGRATIONS_DIR = resolve(
  import.meta.dirname,
  '../../../../../packages/db/supabase/migrations',
)

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
      // `begin read only`, NOT `set default_transaction_read_only = on`.
      //
      // MEASURED in this repo already: a session-level SET through the
      // ap-south-1 pooler is handed to the NEXT client that borrows the
      // connection. The setting is read-only, so the blast radius is "somebody
      // else's writes start failing" rather than data loss — which is precisely
      // the kind of fault that gets blamed on the application for a day. A
      // transaction-scoped `begin read only` ends when this query does and
      // cannot outlive the connection.
      await client.query('begin read only')
      const result = await client.query(SCHEMA_QUERY)
      await client.query('rollback')
      return result.rows
    } finally {
      await client.end()
    }
  }

  /**
   * The live schema, or a loud skip if this machine cannot reach the database.
   *
   * The skip happens ONLY around the connection. Once rows come back, every
   * failure below is a real finding and is allowed to be red — which is the
   * whole point of the file. Never widen this to wrap the assertions.
   */
  async function readSchemaOrSkip(
    skip: TestContext['skip'],
  ): Promise<Array<{ table_name: string; has_read_policy: boolean }>> {
    try {
      return await readSchema()
    } catch (error) {
      const code = unreachableCode(error)
      if (code === null) throw error
      // The host, never the URL: `DB_URL` carries the production password.
      let host = 'the database'
      try {
        host = new URL(DB_URL).hostname
      } catch {
        // An unparseable URL is not worth failing over inside a skip note.
      }
      const note =
        `could not reach ${host} (${code}), so the export manifest is UNCHECKED ` +
        `against production on this machine. ` +
        `packages/db/tests/export_manifest.pglite.test.ts still checked it against the migration files.`
      // Louder than the skip marker alone. A reporter that collapses skips is
      // exactly how this file went four days without ever running.
      console.warn(`SKIPPED · export drift vs the live schema: ${note}`)
      skip(note)
    }
  }

  it('knows about every workspace-owned table, and invents none', async ({ skip }) => {
    const rows = await readSchemaOrSkip(skip)
    const inDb = rows.map((r) => r.table_name).sort()
    const inManifest = EXPORT_TABLES.map((t) => t.table).sort()

    const missing = inDb.filter((t) => !inManifest.includes(t))

    // ── A PHANTOM AND A PENDING MIGRATION ARE DIFFERENT FACTS ───────────────
    // Migrations here are applied BY HAND, so a table routinely lives in the
    // migration files for hours before it lives in production — and during that
    // window the manifest must already name it, because the pglite suite runs
    // against this branch's schema and insists. Failing here for that state
    // would make this suite red for something no session can fix, which is how
    // a guard becomes one people learn to skip.
    //
    // A manifest entry that NO migration creates is still a phantom, and that is
    // the defect this check was written for: a typo or a renamed table means a
    // customer's export silently omits their data.
    const { invented, pending } = splitPhantoms(
      inManifest,
      inDb,
      tablesCreatedByMigrations(MIGRATIONS_DIR),
    )
    if (pending.length > 0) {
      // Reported, never swallowed. A silent allowance is how the excused case
      // becomes permanent.
      console.warn(
        `export manifest names ${pending.length} table(s) whose migration is written and NOT ` +
          `applied to this database: ${pending.join(', ')}`,
      )
    }
    const phantom = invented

    // Named, not counted. "1 table differs" sends someone hunting; the name
    // sends them to the fix.
    expect(
      missing,
      `these tables carry workspace_id and are NOT in the export manifest, so they are missing from every export: ${missing.join(', ')}`,
    ).toEqual([])
    expect(
      phantom,
      `the manifest lists tables that no migration creates and that do not exist: ${phantom.join(', ')}`,
    ).toEqual([])
  }, 30_000)

  it('classifies readability the way the policies actually do', async ({ skip }) => {
    const rows = await readSchemaOrSkip(skip)
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
