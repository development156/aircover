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
 * "Without a database" used to mean an unset `SUPABASE_DB_URL`, and that was
 * the right test until 2026-08-24, when `scripts/cloud-setup.sh` began writing
 * a real `.env` into the cloud sandbox. The URL is now SET in an environment
 * whose DNS cannot resolve the host it names, so from that date this file was
 * red on every sandbox run: `getaddrinfo ENOTFOUND`, twice, on a tree with no
 * defect in it. Both conditions are honoured now — no URL, or a URL nothing
 * answers at. `db-reachability.ts` draws that line and argues where, and its
 * own guard is the thing keeping a real failure out of the skip.
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

import { describe, it, expect, type TestContext } from 'vitest'

import { unreachableReason } from './db-reachability'
import { EXPORT_TABLES } from './export-manifest'

/** Thrown only when nothing answered at the address. Never when a server did. */
class DatabaseUnreachable extends Error {}

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
    try {
      await client.connect()
    } catch (error) {
      // Only the CONNECT is allowed to excuse itself. Anything the server says
      // once it has answered — a refused password, a denied grant, a query that
      // errors — falls through and stays red.
      const reason = unreachableReason(error)
      if (reason !== null) throw new DatabaseUnreachable(reason)
      throw error
    }
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
   * The schema, or a skip naming the host that never answered.
   *
   * The skip is a runtime one rather than `describe.skip`, because reachability
   * cannot be known at collection time without opening the connection this test
   * exists to open. The note is what somebody reads in the reporter, so it says
   * which host and which syscall, not "database unavailable".
   */
  async function readSchemaOrSkip(ctx: TestContext) {
    try {
      return await readSchema()
    } catch (error) {
      if (error instanceof DatabaseUnreachable) {
        ctx.skip(`SUPABASE_DB_URL is set, but nothing answered: ${error.message}`)
      }
      throw error
    }
  }

  it('knows about every workspace-owned table, and invents none', async (ctx) => {
    const rows = await readSchemaOrSkip(ctx)
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

  it('classifies readability the way the policies actually do', async (ctx) => {
    const rows = await readSchemaOrSkip(ctx)
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
