import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import type { PGlite } from '@electric-sql/pglite'

import { bootFullSchema, tenantTables } from './helpers/pglite-tenant'

/**
 * THE DPDP EXPORT MANIFEST, CHECKED AGAINST THE SCHEMA, WITH NO CREDENTIALS.
 *
 * ── WHAT THIS ADDS TO `export-drift.test.ts` ─────────────────────────────────
 * That suite asks the same two questions of the LIVE database and is the only
 * thing that can speak for production. It is also `describe.skip` without
 * `SUPABASE_DB_URL`, and the only project this repo has is production, which
 * `forbidden-target.ts` refuses on purpose. So on an ordinary run the export
 * manifest is checked by nothing at all — and the claim it makes is the one
 * claim an export must never make falsely: "everything you own".
 *
 * This is the same check against the MIGRATION FILES, in process, on every gate
 * run. It cannot say what production holds. It can say that the manifest matches
 * the schema this repo describes, which is what actually goes stale when
 * somebody adds a table and forgets.
 *
 * ── WHY IT READS apps/web's SOURCE RATHER THAN IMPORTING IT ──────────────────
 * `packages/db` cannot import from `apps/web`. So the entries are read out of
 * the file as text — and, exactly as `service-rpc.test.ts` does with its RPC
 * allowlist, ANYTHING THE PARSE CANNOT READ IS A FAILURE rather than an
 * omission. An entry written in a form this regex does not match would otherwise
 * be invisible, and invisible reads identically to absent.
 */

const MANIFEST = resolve(
  import.meta.dirname,
  '../../../apps/web/src/lib/privacy/export-manifest.ts',
)

interface Entry {
  table: string
  readability: string
}

/** Just the `EXPORT_TABLES = [ … ]` literal, so nothing after it can be read. */
function manifestBody(source: string): string {
  const start = source.indexOf('EXPORT_TABLES')
  const end = source.indexOf('] as const', start)
  return source.slice(start, end)
}

/** Every `{ table: '…', readability: '…', … }` literal in the manifest. */
function entriesIn(source: string): Entry[] {
  const body = manifestBody(source)
  return [...body.matchAll(/table:\s*'([^']+)',\s*\n?\s*readability:\s*'([^']+)'/g)].map((m) => ({
    table: m[1]!,
    readability: m[2]!,
  }))
}

/**
 * Every `table:` key in the list, however the formatter happened to wrap it.
 *
 * The check that makes the parse above mean something: if these two counts
 * disagree, an entry exists that `entriesIn` could not read, and every
 * assertion below silently skipped it.
 *
 * MEASURED while writing this: the first version anchored to the start of a
 * line, which matched only the entries prettier had wrapped — two of thirty-two.
 * It reported a parse gap that was not there, which is the harmless direction;
 * the same mistake pointed the other way would have excused thirty entries from
 * every check in this file.
 */
function tableKeyCount(source: string): number {
  return [...manifestBody(source).matchAll(/\btable:\s/g)].length
}

let db: PGlite
let source: string

beforeAll(async () => {
  source = readFileSync(MANIFEST, 'utf8')
  db = await bootFullSchema()
}, 120_000)

describe('the export manifest matches the schema', () => {
  it('has no entry this test cannot read', () => {
    expect(entriesIn(source).length).toBe(tableKeyCount(source))
    // Sanity: an empty parse would make every assertion below vacuous.
    expect(entriesIn(source).length).toBeGreaterThan(20)
  })

  it('knows about every workspace-owned table, and invents none', async () => {
    const inDb = (await tenantTables(db)).sort()
    const inManifest = entriesIn(source)
      .map((e) => e.table)
      .sort()

    const missing = inDb.filter((t) => !inManifest.includes(t))
    const phantom = inManifest.filter((t) => !inDb.includes(t))

    // Named, not counted. "1 table differs" sends somebody hunting; the name
    // sends them to the fix.
    expect(
      missing,
      `these tables carry workspace_id and are NOT in the export manifest, so they are ` +
        `missing from every export: ${missing.join(', ')}`,
    ).toEqual([])
    expect(
      phantom,
      `the manifest lists tables the migrations do not create, or that do not carry ` +
        `workspace_id: ${phantom.join(', ')}`,
    ).toEqual([])
  })

  it('classifies readability the way the policies actually do', async () => {
    const policies = (
      await db.query<{ tablename: string; cmd: string }>(
        `select tablename, cmd from pg_policies where schemaname = 'public'`,
      )
    ).rows

    const readable = new Set(
      policies.filter((p) => p.cmd === 'SELECT' || p.cmd === 'ALL').map((p) => p.tablename),
    )

    const wrong: string[] = []
    for (const entry of entriesIn(source)) {
      const expected = readable.has(entry.table) ? 'readable' : 'no-read-policy'
      if (entry.readability !== expected) {
        wrong.push(`${entry.table}: manifest says ${entry.readability}, policies say ${expected}`)
      }
    }

    // The silent case: a table that LOSES its read policy starts answering []
    // instead of erroring, and the export would quietly begin claiming the
    // customer has no such rows.
    expect(wrong, wrong.join(' · ')).toEqual([])
  })

  it('includes leads, which hold a real person’s contact details', async () => {
    // Named on its own rather than left to the sweep above. A lead carries
    // somebody's name, email and phone number, and they are not the customer —
    // so its presence in the export is the one entry worth failing by name.
    const leads = entriesIn(source).find((e) => e.table === 'leads')
    expect(leads).toEqual({ table: 'leads', readability: 'readable' })
    expect(await tenantTables(db)).toContain('leads')
  })
})
