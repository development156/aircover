#!/usr/bin/env node
/**
 * REBUILD A MIGRATION FILE THAT THE AUGUST SQUASH DELETED, from the statements
 * production still holds.
 *
 * ── WHY THIS IS A SCRIPT AND NOT A COPY-PASTE ────────────────────────────────
 * `supabase_migrations.schema_migrations.statements` is a text[] of exactly what
 * ran. Retyping ~300 lines of plpgsql out of a query result introduces a
 * difference nobody can see — and the whole point of the exercise is that the
 * file and the database agree. So the file is GENERATED from the array, and the
 * generator is committed beside it so the next person can re-run it rather than
 * trust the diff.
 *
 * ── WHAT IT CANNOT RECOVER ───────────────────────────────────────────────────
 * The supabase CLI splits a migration into statements before recording it, so
 * anything BETWEEN two statements — a standalone comment block, blank-line
 * shaping — is gone. Comments that lead a statement survive, because they are
 * part of it. The header this writes says so, rather than presenting the result
 * as the original file.
 *
 * Usage:
 *   node packages/db/scripts/recover-lost-migration.mjs 20260812000000
 */
import { writeFileSync } from 'node:fs'
import { readFileSync } from 'node:fs'
import { resolve, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import pg from 'pg'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(HERE, '../../..')
const MIGRATIONS = join(REPO_ROOT, 'packages/db/supabase/migrations')

function envFrom(path) {
  let text
  try {
    text = readFileSync(path, 'utf8')
  } catch {
    return {}
  }
  const out = {}
  for (const line of text.split('\n')) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line)
    if (!m) continue
    out[m[1]] = m[2].trim().replace(/^["']|["']$/g, '')
  }
  return out
}

const version = process.argv[2]
if (!version) {
  console.error('usage: recover-lost-migration.mjs <version>')
  process.exit(2)
}

const env = { ...envFrom(join(REPO_ROOT, '.env')), ...process.env }
const connectionString = env.SUPABASE_DB_URL
if (!connectionString) throw new Error('SUPABASE_DB_URL is not set')

const client = new pg.Client({ connectionString, ssl: { rejectUnauthorized: false } })
await client.connect()
// Read-only for the TRANSACTION, never the session: the pooler hands a session
// with `default_transaction_read_only` set on to whoever connects next.
await client.query('begin read only')
const { rows } = await client.query(
  'select name, statements from supabase_migrations.schema_migrations where version = $1',
  [version],
)
await client.query('commit')
await client.end()

if (rows.length === 0) throw new Error(`no record for ${version}`)
const { name, statements } = rows[0]
if (!statements || statements.length === 0) {
  throw new Error(`${version} (${name ?? 'unnamed'}) has ZERO recorded statements — nothing to recover`)
}

const header = `-- ─────────────────────────────────────────────────────────────────────────────
-- RECONSTRUCTED FILE. Not the original bytes.
--
-- This migration was APPLIED to production on ${version.slice(0, 4)}-${version.slice(4, 6)}-${version.slice(6, 8)} and RECORDED in
-- \`supabase_migrations.schema_migrations\`, but its file was lost in the August
-- history squash. Every PGlite suite in this repo builds its schema from this
-- directory, so while the file was missing those suites ran against a schema
-- production did not have — which is how a column can be "applied and nothing
-- set it" with a green test run either side of it.
--
-- Regenerated from the recorded statements by:
--   node packages/db/scripts/recover-lost-migration.mjs ${version}
--
-- The statements below are the exact text production executed, in order. What
-- is NOT recovered: anything that sat BETWEEN two statements — a standalone
-- comment, the blank-line shaping — because the CLI splits on statements before
-- recording them. Leading comments survive as part of their statement.
--
-- DO NOT re-run this against production. It is already applied; this file exists
-- so the local schema matches, not to change anything.
-- ─────────────────────────────────────────────────────────────────────────────

`

const body = statements.map((s) => `${s.trimEnd()};`).join('\n\n')
const file = join(MIGRATIONS, `${version}_${name}.sql`)
writeFileSync(file, header + body + '\n')
console.log(`wrote ${file}  (${statements.length} statement${statements.length === 1 ? '' : 's'})`)
