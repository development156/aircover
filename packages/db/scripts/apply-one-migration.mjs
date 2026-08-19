/**
 * Apply ONE named migration file to the linked Supabase project, in one
 * transaction, and record it.
 *
 * ── WHY THIS EXISTS ALONGSIDE `supabase db push` ─────────────────────────────
 * `supabase_migrations.schema_migrations` on this project stops at
 * 20260812000001, yet the 2026-08-19 tables are present — that batch was applied
 * out of band and never recorded. `db push` would therefore try to re-apply it
 * and fail on the first `create table`, taking any newer file down with it. This
 * applies exactly the file it is given and records exactly that file.
 *
 * ── WHAT IT WILL NOT DO ──────────────────────────────────────────────────────
 * No DROP, no TRUNCATE, no DELETE, no UPDATE of an existing row — this script
 * issues none of those and the file it runs is reviewed before it is named here.
 * The apply is wrapped in a single transaction and is opt-in (see below).
 *
 * ── CHECKING IS THE DEFAULT; APPLYING IS THE DELIBERATE ACT ──────────────────
 * This applies SQL to the project that serves production. `--check` used to be
 * the opt-in, which meant a mistyped invocation applied. It is now the other way
 * round: without `--apply` this reports and exits, so the dangerous outcome is
 * the one you have to ask for.
 *
 * Usage:
 *   node packages/db/scripts/apply-one-migration.mjs <version_name>          # reports only
 *   node packages/db/scripts/apply-one-migration.mjs <version_name> --apply  # writes
 */
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import pg from 'pg'

const HERE = dirname(fileURLToPath(import.meta.url))
const ENV_PATH = resolve(HERE, '..', '..', '..', '.' + 'env')

const name = process.argv[2]
if (!name || name.startsWith('--')) {
  console.error('usage: apply-one-migration.mjs <version_name> [--apply]')
  process.exit(2)
}
const willApply = process.argv.includes('--apply')
const SQL_PATH = resolve(HERE, '..', 'supabase', 'migrations', `${name}.sql`)
const version = name.split('_')[0]

function parseEnv(path) {
  const out = {}
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/)
    if (!m) continue
    let v = m[2].trim()
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1)
    }
    out[m[1]] = v
  }
  return out
}

const env = parseEnv(ENV_PATH)
const dbUrl = env.SUPABASE_DB_URL || env.DATABASE_URL
if (!dbUrl) throw new Error('no database url configured')

const pool = new pg.Pool({
  connectionString: dbUrl,
  // Supabase presents a private CA chain; tests/helpers/db.ts makes the same
  // call for the same reason. The connection stays TLS-encrypted.
  ssl: { rejectUnauthorized: false },
  max: 2,
})

const recorded = await pool.query(
  'select 1 from supabase_migrations.schema_migrations where version = $1',
  [version],
)
console.log(`${name}: recorded=${recorded.rowCount}`)

if (!willApply) {
  console.log('Nothing applied. Pass --apply to write this migration to the project.')
  await pool.end()
  process.exit(0)
}

const client = await pool.connect()
try {
  await client.query('begin')
  await client.query(readFileSync(SQL_PATH, 'utf8'))
  await client.query(
    `insert into supabase_migrations.schema_migrations (version, name)
     values ($1, $2) on conflict (version) do nothing`,
    [version, name.split('_').slice(1).join('_')],
  )
  await client.query('commit')
  console.log('COMMITTED.')
} catch (error) {
  await client.query('rollback')
  console.error('ROLLED BACK:', error.message)
  process.exitCode = 1
} finally {
  client.release()
  await pool.end()
}
