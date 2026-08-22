/**
 * Read-only. What the LIVE database actually has for Radar, read from its own
 * catalog rather than from the migration files.
 *
 * The PGlite suite proves the FILES are correct. This proves production matches
 * them — the two are different claims, and this repository has already found a
 * case where production and its own migration history had silently diverged.
 */
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

const TABLES = [
  'competitors',
  'competitor_sources',
  'competitor_subscriptions',
  'competitor_snapshots',
  'competitor_changes',
  'radar_fetch_log',
  'radar_limits',
]

console.log('table                      rls   policies  triggers  indexes')
for (const t of TABLES) {
  const rls = await pool.query(
    `select relrowsecurity from pg_class where relname = $1 and relnamespace = 'public'::regnamespace`,
    [t],
  )
  const pol = await pool.query(
    `select polname, polcmd from pg_policy where polrelid = $1::regclass order by polname`,
    [t],
  )
  const trg = await pool.query(
    `select tgname from pg_trigger where tgrelid = $1::regclass and not tgisinternal`,
    [t],
  )
  const idx = await pool.query(`select indexname from pg_indexes where tablename = $1`, [t])
  console.log(
    `${t.padEnd(26)} ${String(rls.rows[0]?.relrowsecurity).padEnd(5)} ` +
      `${String(pol.rowCount).padEnd(9)} ${String(trg.rowCount).padEnd(9)} ${idx.rowCount}`,
  )
  for (const p of pol.rows) console.log(`    policy ${p.polname} (${p.polcmd})`)
}

const fns = await pool.query(
  `select p.proname, pg_get_function_identity_arguments(p.oid) as args, p.prosecdef
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'app' and p.proname like 'radar%' order by p.proname`,
)
console.log('\napp functions:')
for (const f of fns.rows) {
  console.log(`  ${f.proname}(${f.args})  security_definer=${f.prosecdef}`)
}

const guarded = await pool.query(
  `select distinct rel.relname as t
     from pg_trigger tg
     join pg_class rel on rel.oid = tg.tgrelid
     join pg_proc p on p.oid = tg.tgfoid
     join pg_namespace n on n.oid = rel.relnamespace
    where n.nspname = 'public' and p.proname = 'block_mutations'
    order by 1`,
)
console.log('\nblock_mutations guards (' + guarded.rowCount + '):')
console.log(JSON.stringify(guarded.rows.map((r) => r.t)))

const counts = await pool.query(`
  select 'competitors' as t, count(*)::int as n from competitors
  union all select 'competitor_sources', count(*)::int from competitor_sources
  union all select 'competitor_subscriptions', count(*)::int from competitor_subscriptions
  union all select 'competitor_snapshots', count(*)::int from competitor_snapshots
  union all select 'competitor_changes', count(*)::int from competitor_changes
  union all select 'radar_fetch_log', count(*)::int from radar_fetch_log
  order by 1`)
console.log('\nrow counts (should be all zero — no customer uses Radar yet):')
for (const r of counts.rows) console.log(`  ${r.t.padEnd(26)} ${r.n}`)

const limits = await pool.query(`select * from radar_limits`)
console.log('\nradar_limits:', JSON.stringify(limits.rows))

await pool.end()
