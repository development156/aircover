/**
 * THE ROW COUNT BEFORE ANYTHING IS PROBED — every table, not the ones expected.
 *
 * A probe that lands somewhere unexpected is exactly what a targeted count
 * misses. Taken PRIVILEGED and direct, because counting through a token that was
 * just refused is self-confirming: that token cannot see the row either way.
 */
import fs from 'node:fs'
import path from 'node:path'

import { q } from '../lib/db.mjs'
import { WT } from '../lib/env.mjs'

const label = process.argv[2] ?? 'before'

const tables = await q(`
  select c.relname
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname='public' and c.relkind='r'
  order by 1`)

const counts = {}
for (const { relname } of tables) {
  const r = await q(`select count(*)::int as n from public."${relname}"`)
  counts[relname] = r[0].n
}

const out = path.join(WT, 'audit', 'out', `rowcount-${label}.json`)
fs.mkdirSync(path.dirname(out), { recursive: true })
fs.writeFileSync(out, JSON.stringify({ label, at: new Date().toISOString(), counts }, null, 1))
console.log(
  `${tables.length} tables, total rows ${Object.values(counts).reduce((a, b) => a + b, 0)} → ${out}`,
)
