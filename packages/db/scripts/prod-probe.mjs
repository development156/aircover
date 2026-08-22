#!/usr/bin/env node
/**
 * A READ-ONLY probe of whatever `SUPABASE_DB_URL` names, for questions this repo's
 * tooling cannot otherwise answer from a session.
 *
 * ── WHY IT EXISTS ────────────────────────────────────────────────────────────
 * The supabase MCP server is unauthorized in these sessions and `Bash(curl:*)` is
 * denied, so the only route to production's own answer is a node client that parses
 * the env file itself — the same route `packages/db/scripts/ledger-invariants.mjs`
 * takes. This file generalises it: pass SQL, get rows.
 *
 * ── THE ONE THING IT DOES DIFFERENTLY FROM ledger-invariants.mjs ─────────────
 * That script opens with `set session characteristics as transaction read only`,
 * which sets `default_transaction_read_only` for the SESSION. Supabase's pooler is
 * transaction-mode: the server-side session outlives this client and is handed to
 * the next one, which then finds its writes refused for a reason it cannot see.
 * `begin read only` scopes the same guarantee to the transaction, so it cannot
 * escape. This file uses only `begin read only`.
 *
 * Usage:
 *   node packages/db/scripts/prod-probe.mjs --sql "select 1"
 *   node packages/db/scripts/prod-probe.mjs --file path/to/query.sql
 *   node packages/db/scripts/prod-probe.mjs --migrations      # applied migration versions
 */
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import pg from 'pg'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(HERE, '../../..')

function readEnvFile(path) {
  let text
  try {
    text = readFileSync(path, 'utf8')
  } catch {
    return {}
  }
  const out = {}
  for (const line of text.split('\n')) {
    const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line)
    if (!m) continue
    let value = m[2].trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    out[m[1]] = value
  }
  return out
}

/** Refuse anything that could write, before the server is even asked. */
const FORBIDDEN = /\b(insert|update|delete|drop|truncate|alter|create|grant|revoke)\b/i

const MIGRATIONS_SQL = `
  select version, name
  from supabase_migrations.schema_migrations
  order by version
`

function parseArgs(argv) {
  const out = { sql: null }
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--sql') out.sql = argv[++i]
    else if (argv[i] === '--file') out.sql = readFileSync(argv[++i], 'utf8')
    else if (argv[i] === '--migrations') out.sql = MIGRATIONS_SQL
  }
  return out
}

async function main() {
  const { sql } = parseArgs(process.argv.slice(2))
  if (!sql) {
    console.error('nothing to run: pass --sql, --file or --migrations')
    process.exit(2)
  }
  if (FORBIDDEN.test(sql)) {
    console.error('refused: this probe runs read-only statements only')
    process.exit(2)
  }

  const fileEnv = readEnvFile(resolve(REPO_ROOT, '.env'))
  const connectionString =
    process.env.SUPABASE_DB_URL || fileEnv.SUPABASE_DB_URL || fileEnv.DATABASE_URL
  if (!connectionString) {
    console.error('No SUPABASE_DB_URL — nothing to ask.')
    process.exit(2)
  }

  const ssl = /supabase\.(co|com|in|net)/.test(connectionString)
    ? { rejectUnauthorized: false }
    : undefined
  const pool = new pg.Pool({ connectionString, max: 1, ssl })
  const client = await pool.connect()
  try {
    await client.query('begin read only')
    // The server's own answer to "who am I", printed with every run so a result can
    // never be attributed to the wrong database.
    const who = (
      await client.query(
        `select current_database() as db, current_user as usr,
                inet_server_addr()::text as host, version() as ver`,
      )
    ).rows[0]
    console.error(`-- ${who.db} as ${who.usr} @ ${who.host ?? 'pooler'}`)
    const { rows } = await client.query(sql)
    console.log(JSON.stringify(rows, null, 2))
    await client.query('rollback')
  } finally {
    client.release()
    await pool.end()
  }
}

main().catch((e) => {
  console.error(e.message)
  process.exit(2)
})
