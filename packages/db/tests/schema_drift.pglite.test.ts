import { describe, it, expect } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto'
import { readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  fingerprint,
  drift,
  describeDrift,
  type SchemaFingerprint,
} from './helpers/schema-fingerprint'

/**
 * DOES THE MIGRATION DIRECTORY STILL BUILD THE SCHEMA PRODUCTION HAS?
 *
 * On 2026-08-23 it did not, and nothing said so. Two migrations were applied to
 * production and recorded there, and their files were lost in the August history
 * squash. `pglite-tenant.ts` builds from that directory, so every PGlite suite
 * ran against a schema missing a column production has — and every one of them
 * passed, because no check compared the two.
 *
 * This one does, and it needs NO CREDENTIALS: production's side is a committed
 * snapshot (`schema-snapshot.prod.json`, refreshed by
 * `scripts/capture-schema-snapshot.ts`), and this side is a real Postgres built
 * from the migration files production says it has applied.
 *
 * ── WHAT IT CANNOT SEE ──────────────────────────────────────────────────────
 * It reads migration FILENAMES off disk and compares two catalog fingerprints:
 *  · a migration applied to production and never recorded there is invisible —
 *    the snapshot is built from `schema_migrations`, so an unrecorded apply looks
 *    like drift in the schema rather than like a missing record;
 *  · function BODIES. `pg_get_functiondef` renders differently between server
 *    versions, so a body change inside an unchanged signature passes;
 *  · triggers, grants, constraints by name, sequences, and anything outside the
 *    `public` and `app` schemas;
 *  · a file whose CONTENT changed without changing any object this fingerprint
 *    covers — a comment, a reordered statement, a different way of spelling the
 *    same DDL;
 *  · production as it is RIGHT NOW. The comparison is against a committed
 *    snapshot, so drift introduced after the last capture is invisible until
 *    somebody re-runs `capture-schema-snapshot.ts`.
 *
 * ── IT BUILDS THE RECORDED SET, NOT THE DIRECTORY ────────────────────────────
 * A lane's unapplied migration is pending work, not drift. Building every file
 * would report every branch in flight as a failure, and a check that is red on
 * every branch is a check everyone turns off. So the set is exactly what
 * `supabase_migrations.schema_migrations` held at capture time.
 *
 * The consequence is the important half: a file that is RECORDED but MISSING is
 * not silently skipped, it fails this test by name. That is the defect above.
 */

/**
 * ⚠ FOUR TABLES IN PRODUCTION THAT THIS REPO DOES NOT BUILD. ⚠
 *
 * MEASURED 2026-08-23. `public.brands`, `public.elements`, `public.jobs` and
 * `public.ledger` exist in production with RLS on, eleven indexes between them,
 * and one function — `charge_if_affordable(p_cost, p_reason, p_job_id, p_tenant)`.
 * NO migration in this repo creates any of them, and their vocabulary is not this
 * product's: they are keyed by `tenant_id text default 'default'`, where every
 * table Sahoda owns is keyed by `workspace_id uuid`.
 *
 * They are ANOTHER application sharing this Supabase project. Rows at capture
 * time: brands 0, elements 0, jobs 0, ledger 1.
 *
 * They are listed here rather than filtered out silently for two reasons. A
 * reader of this file should learn they exist — a second app in the same
 * `public` schema is a fact about the blast radius of anything done here. And
 * naming them EXACTLY means a FIFTH unmanaged table appearing tomorrow fails
 * this test instead of joining a wildcard nobody reads.
 *
 * Not this lane's to remove: dropping a table is irreversible, and it is not
 * ours. It is in the report for the founder.
 */
const UNMANAGED_IN_PRODUCTION = ['brands', 'elements', 'jobs', 'ledger'] as const

const UNMANAGED_FUNCTIONS = ['public.charge_if_affordable'] as const

/** True when a drift row is one of the four tables above, or something on one. */
function isUnmanaged(kind: string, key: string): boolean {
  if (kind === 'functions') return (UNMANAGED_FUNCTIONS as readonly string[]).includes(key)
  const parts = key.split('.')
  const name = parts[1] ?? ''
  if (parts[0] !== 'public') return false
  if (kind === 'tables' || kind === 'columns' || kind === 'policies') {
    return (UNMANAGED_IN_PRODUCTION as readonly string[]).includes(name)
  }
  // An index is named, not qualified by its table, so it is matched by prefix —
  // every one of the eleven is `<table>_something`.
  return UNMANAGED_IN_PRODUCTION.some((tbl) => name === `${tbl}_pkey` || name.startsWith(`${tbl}_`))
}

const MIGRATIONS = resolve(import.meta.dirname, '../supabase/migrations')
const SNAPSHOT = resolve(import.meta.dirname, '../schema-snapshot.prod.json')

interface Snapshot {
  recordedVersions: string[]
  recordedNames: Record<string, string | null>
  objects: SchemaFingerprint
}

const snapshot = JSON.parse(readFileSync(SNAPSHOT, 'utf8')) as Snapshot

/** Migration files on disk, indexed by the version prefix of their name. */
function filesByVersion(): Map<string, string[]> {
  const map = new Map<string, string[]>()
  for (const name of readdirSync(MIGRATIONS)
    .filter((f) => f.endsWith('.sql'))
    .sort()) {
    const version = name.split('_')[0] ?? name
    map.set(version, [...(map.get(version) ?? []), name])
  }
  return map
}

describe('the migration directory builds the schema production has', () => {
  it('has a file for every migration production has recorded', () => {
    const onDisk = filesByVersion()
    const missing = snapshot.recordedVersions.filter((v) => !onDisk.has(v))
    expect(
      missing,
      missing.length === 0
        ? ''
        : 'Production has applied and recorded these migrations, and this repo has no file ' +
            'for them. Every PGlite suite is building a schema production does not have.\n' +
            missing
              .map((v) => `  ${v}  ${snapshot.recordedNames[v] ?? '(no name recorded)'}`)
              .join('\n') +
            '\nRecover them: node packages/db/scripts/recover-lost-migration.mjs <version>',
    ).toEqual([])
  })

  it('gives each recorded version exactly one file', () => {
    const onDisk = filesByVersion()
    const collisions = snapshot.recordedVersions
      .filter((v) => (onDisk.get(v) ?? []).length > 1)
      .map((v) => `  ${v} -> ${(onDisk.get(v) ?? []).join(', ')}`)
    expect(
      collisions,
      collisions.length === 0
        ? ''
        : 'Two files share one version. Only one of them can ever be recorded, so the ' +
            'others are applied-but-unrecorded forever:\n' +
            collisions.join('\n'),
    ).toEqual([])
  })

  it('builds a schema that matches production, object for object', async () => {
    const onDisk = filesByVersion()
    const db = await new PGlite({ extensions: { pgcrypto } })
    await db.exec(
      readFileSync(resolve(import.meta.dirname, 'helpers/supabase-prelude.sql'), 'utf8'),
    )
    for (const version of snapshot.recordedVersions) {
      for (const file of onDisk.get(version) ?? []) {
        await db.exec(readFileSync(resolve(MIGRATIONS, file), 'utf8'))
      }
    }

    const built = await fingerprint(db)
    await db.close()

    const all = drift(snapshot.objects, built)
    const found = all.filter((d) => !isUnmanaged(d.kind, d.key))
    expect(
      found,
      found.length === 0
        ? ''
        : `${found.length} difference(s) between production and what these migrations build.\n` +
            'Either a migration was applied to production without its file reaching this repo, ' +
            'or a file changed after it was applied. Refresh the snapshot only once you know ' +
            'which:\n' +
            describeDrift(found),
    ).toEqual([])
  }, 120_000)

  it('finds no unmanaged table in production beyond the four that are declared', async () => {
    const declared = new Set<string>(UNMANAGED_IN_PRODUCTION)
    const onDisk = filesByVersion()
    const db = await new PGlite({ extensions: { pgcrypto } })
    await db.exec(
      readFileSync(resolve(import.meta.dirname, 'helpers/supabase-prelude.sql'), 'utf8'),
    )
    for (const version of snapshot.recordedVersions) {
      for (const file of onDisk.get(version) ?? []) {
        await db.exec(readFileSync(resolve(MIGRATIONS, file), 'utf8'))
      }
    }
    const built = await fingerprint(db)
    await db.close()

    // In production, absent from what the migrations build, and a table.
    const surprises = Object.keys(snapshot.objects.tables)
      .filter((k) => !(k in built.tables))
      .map((k) => k.split('.')[1] ?? k)
      .filter((name) => !declared.has(name))
    expect(
      surprises,
      surprises.length === 0
        ? ''
        : 'Production has table(s) no migration here creates, and they are not among the ' +
            'four already known about:\n  ' +
            surprises.join('\n  '),
    ).toEqual([])
  }, 120_000)
})
