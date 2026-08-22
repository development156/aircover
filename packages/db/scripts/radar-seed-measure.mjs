/**
 * Seed a throwaway workspace with REAL competitors so the nightly pass can be
 * measured against real websites and a real Instagram account, then remove it.
 *
 * Namespaced and reversible: it deletes exactly the ids it created, by id. No
 * DROP, no TRUNCATE, no unqualified DELETE.
 *
 *   node packages/db/scripts/radar-seed-measure.mjs seed
 *   node packages/db/scripts/radar-seed-measure.mjs report
 *   node packages/db/scripts/radar-seed-measure.mjs clean
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import pg from 'pg'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, '../../..')
const STATE = resolve(HERE, '.radar-measure-state.json')

const env = {}
for (const name of ['.env', 'apps/web/.env']) {
  let txt
  try {
    txt = readFileSync(resolve(ROOT, name), 'utf8')
  } catch {
    continue
  }
  for (const line of txt.split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/)
    if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '')
  }
}

const pool = new pg.Pool({
  connectionString: env.SUPABASE_DB_URL,
  ssl: { rejectUnauthorized: false },
  max: 3,
})

/**
 * Real Indian small-business sites plus one real Instagram account — the market
 * Radar is for. Synthetic fixtures would answer a question nobody asked: static
 * pages hash stably by construction, which is exactly the result under test.
 */
const COMPETITORS = [
  { name: 'Blue Tokai', sources: [{ kind: 'website', locator: 'bluetokaicoffee.com' }] },
  { name: 'The Whole Truth', sources: [{ kind: 'website', locator: 'thewholetruthfoods.com' }] },
  { name: 'Sleepy Owl', sources: [{ kind: 'website', locator: 'sleepyowl.co' }] },
  { name: 'Bombay Shaving', sources: [{ kind: 'website', locator: 'bombayshavingcompany.com' }] },
  { name: 'Mamaearth', sources: [{ kind: 'website', locator: 'mamaearth.in' }] },
  { name: 'Chaayos', sources: [{ kind: 'website', locator: 'chaayos.com' }] },
  { name: 'Paper Boat', sources: [{ kind: 'website', locator: 'paperboatdrinks.com' }] },
  { name: 'boAt', sources: [{ kind: 'website', locator: 'boat-lifestyle.com' }] },
  // The one paid source in the set. $0.0026 per run, measured.
  { name: 'Blue Tokai social', sources: [{ kind: 'instagram', locator: 'bluetokaicoffee' }] },
]

const command = process.argv[2] ?? 'report'

if (command === 'seed') {
  const run = `radarmeasure${Date.now().toString(36)}`
  const ws = await pool.query(
    `insert into workspaces (name, slug, created_by) values ('radar measure', $1, $2) returning id`,
    [run, `user_${run}`],
  )
  const workspaceId = ws.rows[0].id
  await pool.query(
    `insert into workspace_members (workspace_id, user_id, role) values ($1::uuid, $2, 'owner')`,
    [workspaceId, `user_${run}`],
  )

  const competitorIds = []
  for (const c of COMPETITORS) {
    const r = await pool.query(`select app.radar_subscribe($1::uuid, $2, $3::jsonb, $4) as out`, [
      workspaceId,
      c.name,
      JSON.stringify(c.sources),
      `user_${run}`,
    ])
    competitorIds.push(r.rows[0].out.competitor_id)
  }

  // A website's natural cadence is weekly. For a measurement that needs two
  // passes minutes apart, that would mean nothing was ever due on the second —
  // so the seed forces them daily and says so rather than quietly waiting a week.
  await pool.query(
    `update competitor_sources set cadence = 'daily'
      where competitor_id = any($1::uuid[]) and cadence = 'weekly'`,
    [competitorIds],
  )

  writeFileSync(STATE, JSON.stringify({ run, workspaceId, competitorIds }, null, 2))
  console.log(`seeded ${competitorIds.length} competitors under ${run}`)
  console.log(`workspace ${workspaceId}`)
} else if (command === 'clean') {
  if (!existsSync(STATE)) {
    console.log('nothing to clean — no state file')
  } else {
    const state = JSON.parse(readFileSync(STATE, 'utf8'))
    // By id, one at a time. Competitors cascade to sources, snapshots, changes
    // and the fetch log; the workspace cascades to its subscriptions.
    const c = await pool.query(`delete from competitors where id = any($1::uuid[]) returning id`, [
      state.competitorIds,
    ])
    const w = await pool.query(`delete from workspaces where id = $1::uuid returning id`, [
      state.workspaceId,
    ])
    console.log(`removed ${c.rowCount} competitors and ${w.rowCount} workspace`)
    const left = await pool.query(
      `select count(*)::int as n from competitor_sources cs
        join competitors co on co.id = cs.competitor_id
       where co.id = any($1::uuid[])`,
      [state.competitorIds],
    )
    console.log(`sources left behind: ${left.rows[0].n}`)
  }
} else {
  // ── the report the founder actually needs ─────────────────────────────────
  const log = await pool.query(`
    select provider, mode, outcome, cost_basis,
           count(*)::int as n,
           sum(cost_micros)::bigint as micros,
           avg(subscriber_count)::numeric(10,2) as avg_subs
      from radar_fetch_log
     group by provider, mode, outcome, cost_basis
     order by provider, mode, outcome`)
  console.log('\n── every check attempted, by shape ──────────────────────────')
  console.log('provider  mode    outcome          basis      n   micros   avg subscribers')
  for (const r of log.rows) {
    console.log(
      `${r.provider.padEnd(9)} ${r.mode.padEnd(7)} ${r.outcome.padEnd(16)} ${String(r.cost_basis).padEnd(10)} ${String(r.n).padStart(2)}   ${String(r.micros).padStart(6)}   ${r.avg_subs}`,
    )
  }

  const buckets = await pool.query(`
    select outcome, count(*)::int as n from radar_fetch_log
     where outcome <> 'pending' group by outcome`)
  const total = buckets.rows.reduce((s, r) => s + r.n, 0)
  console.log('\n── the three buckets, never two ────────────────────────────')
  for (const r of buckets.rows) {
    console.log(`  ${r.outcome.padEnd(16)} ${r.n}  (${((r.n / total) * 100).toFixed(1)}%)`)
  }

  const spend = await pool.query(`
    select cost_basis, sum(cost_micros)::bigint as micros from radar_fetch_log group by cost_basis`)
  console.log('\n── spend, split by whether it is a measurement ─────────────')
  for (const r of spend.rows) {
    console.log(`  ${r.cost_basis.padEnd(10)} $${(Number(r.micros) / 1_000_000).toFixed(6)}`)
  }

  const snaps = await pool.query(`select count(*)::int as n from competitor_snapshots`)
  const changes = await pool.query(`select change_kind, day_span, summary from competitor_changes`)
  console.log(`\nsnapshots: ${snaps.rows[0].n}   changes: ${changes.rowCount}`)
  for (const r of changes.rows) {
    console.log(`  [${r.change_kind} · ${r.day_span}d] ${r.summary}`)
  }
}

await pool.end()
