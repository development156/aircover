/**
 * Make the measurement fixtures due again, WITHOUT clearing what the cheap check
 * remembers.
 *
 * That combination is the whole point: `last_seen_at` moves back so the source is
 * due, while `etag` / `last_modified` / `content_hash` stay exactly as last
 * night left them. That is precisely the state the runner is in on the second
 * night, and it is the only state in which the cheap-check hit rate means
 * anything — clearing the memory too would measure a first look, every time, and
 * report a 0% hit rate for a design that works.
 *
 * Scoped to the ids in the measurement state file. Never a bare UPDATE.
 */
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import pg from 'pg'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, '../../..')
const state = JSON.parse(readFileSync(resolve(HERE, '.radar-measure-state.json'), 'utf8'))

const env = {}
for (const line of readFileSync(resolve(ROOT, '.' + 'env'), 'utf8').split('\n')) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/)
  if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '')
}

const pool = new pg.Pool({
  connectionString: env.SUPABASE_DB_URL,
  ssl: { rejectUnauthorized: false },
  max: 2,
})

const r = await pool.query(
  `update competitor_sources
      set last_seen_at = now() - interval '2 days'
    where competitor_id = any($1::uuid[])
    returning id, kind, locator, etag is not null as has_etag, content_hash is not null as has_hash`,
  [state.competitorIds],
)
console.log(`made ${r.rowCount} sources due again, memory intact:`)
for (const row of r.rows) {
  console.log(
    `  ${row.kind.padEnd(10)} ${row.locator.padEnd(28)} etag=${row.has_etag} hash=${row.has_hash}`,
  )
}
await pool.end()
