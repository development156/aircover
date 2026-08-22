/** What the production project has recorded lately, and whether Radar's tables exist. */
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import pg from 'pg'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
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

const host = new URL(env.SUPABASE_DB_URL.replace(/^postgres(ql)?:/, 'http:')).hostname
console.log('host:', host, host.includes('pooler') ? '(pooler — correct)' : '(DIRECT — IPv6 only)')

const recorded = await pool.query(
  `select version, name from supabase_migrations.schema_migrations
    where version >= '20260820' order by version`,
)
console.log('\nrecorded from 2026-08-20 onward:')
for (const r of recorded.rows) console.log(`  ${r.version}  ${r.name ?? ''}`)

const tables = await pool.query(
  `select tablename from pg_tables where schemaname='public'
     and (tablename like 'competitor%' or tablename like 'radar%') order by tablename`,
)
console.log('\nradar tables present:', tables.rows.map((r) => r.tablename).join(', ') || '(none)')

const count = await pool.query(`select count(*)::int as n from pg_tables where schemaname='public'`)
console.log('public tables total:', count.rows[0].n)

await pool.end()
