/**
 * OPS STEP — capture production's schema fingerprint into a committed file, so
 * the gate can compare against it without credentials.
 *
 * Read-only, in a `begin read only` TRANSACTION rather than a session
 * characteristic: the Supabase pooler is transaction-mode and hands the
 * server-side session to the next client, who would then find their writes
 * refused for a reason they cannot see.
 *
 * Run it when a migration is applied to production:
 *   pnpm --filter @sahoda/db exec tsx scripts/capture-schema-snapshot.ts
 *
 * Then commit `packages/db/schema-snapshot.prod.json`. The diff IS the review:
 * a snapshot refresh that changes something nobody expected is the drift, seen
 * before it is normalised away.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import pg from 'pg'
import { fingerprint } from '../tests/helpers/schema-fingerprint'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')

function envFile(name: string): Record<string, string> {
  const out: Record<string, string> = {}
  let raw: string
  try {
    raw = readFileSync(resolve(ROOT, name), 'utf8')
  } catch {
    return out
  }
  for (const line of raw.split('\n')) {
    const t = line.trim()
    if (!t || t.startsWith('#')) continue
    const i = t.indexOf('=')
    if (i === -1) continue
    out[t.slice(0, i).trim()] = t
      .slice(i + 1)
      .trim()
      .replace(/^["']|["']$/g, '')
  }
  return out
}

const E = { ...envFile('.env'), ...envFile('apps/web/.env'), ...process.env }
const url = E.SUPABASE_DB_URL
if (!url) throw new Error('SUPABASE_DB_URL is not set')

const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } })
await client.connect()
await client.query('begin read only')

const objects = await fingerprint(client)

// The set of migrations production says it has applied. The gate builds PGlite
// from EXACTLY these — not from every file on disk, because a lane's unapplied
// migration is pending work and not drift, and reporting it as drift would make
// the check unusable on any branch doing anything.
const recorded = (
  await client.query('select version, name from supabase_migrations.schema_migrations order by version')
).rows as { version: string; name: string | null }[]

await client.query('commit')
await client.end()

const snapshot = {
  note:
    'Production schema fingerprint. Regenerate with ' +
    'pnpm --filter @sahoda/db exec tsx scripts/capture-schema-snapshot.ts. ' +
    'Compared against a PGlite built from the recorded migrations by ' +
    'tests/schema_drift.pglite.test.ts, which needs no credentials.',
  recordedVersions: recorded.map((r) => r.version),
  recordedNames: Object.fromEntries(recorded.map((r) => [r.version, r.name])),
  objects,
}

const out = resolve(ROOT, 'packages/db/schema-snapshot.prod.json')
writeFileSync(out, JSON.stringify(snapshot, null, 2) + '\n')
console.log(
  `wrote ${out}\n` +
    `  ${recorded.length} recorded migrations\n` +
    `  ${Object.keys(objects.tables).length} tables · ` +
    `${Object.keys(objects.columns).length} columns · ` +
    `${Object.keys(objects.indexes).length} indexes · ` +
    `${Object.keys(objects.policies).length} policies · ` +
    `${objects.functions.length} functions`,
)
