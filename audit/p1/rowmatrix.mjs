#!/usr/bin/env node
/**
 * The privileged truth, taken BEFORE any isolation claim.
 *
 * Without this, "workspace B sees nothing" is indistinguishable from "there was
 * nothing to see" — the second of the three ways an isolation suite passes
 * without proving anything. Every table is therefore classified afterwards as
 * either ISOLATION EXERCISED (a foreign row existed and was hidden) or
 * POLICY PRESENT, NEVER EXERCISED (no foreign row existed to hide).
 */
import fs from 'node:fs'
import path from 'node:path'

import { q } from '../lib/db.mjs'
import { WT } from '../lib/env.mjs'

const tables = await q(`
  select c.relname as t,
         exists (select 1 from information_schema.columns col
                 where col.table_schema='public' and col.table_name=c.relname
                   and col.column_name='workspace_id') as has_ws
  from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public' and c.relkind='r' order by 1
`)

const report = { total: {}, byWorkspace: {} }
for (const { t, has_ws } of tables) {
  const [{ n }] = await q(`select count(*)::int as n from public."${t}"`)
  report.total[t] = n
  if (has_ws && n > 0) {
    report.byWorkspace[t] = await q(
      `select workspace_id::text as ws, count(*)::int as n
       from public."${t}" group by workspace_id order by n desc`,
    )
  }
}

// The migration reconcile: what prod has applied that this tree has no file for.
const applied = (
  await q(`select version from supabase_migrations.schema_migrations order by 1`)
).map((r) => r.version)
const dir = path.join(WT, 'packages/db/supabase/migrations')
const local = fs
  .readdirSync(dir)
  .filter((f) => f.endsWith('.sql'))
  .map((f) => f.split('_')[0])
report.migrations = {
  appliedCount: applied.length,
  localCount: local.length,
  appliedNotInTree: applied.filter((v) => !local.includes(v)),
  inTreeNotApplied: local.filter((v) => !applied.includes(v)),
}

fs.writeFileSync(path.join(WT, 'audit/out/rowmatrix.json'), JSON.stringify(report, null, 2))

console.log('=== MIGRATION RECONCILE ===')
console.log('applied in prod :', report.migrations.appliedCount)
console.log('files in tree   :', report.migrations.localCount)
console.log(
  'APPLIED, NO FILE IN THIS TREE:',
  report.migrations.appliedNotInTree.join(', ') || '(none)',
)
console.log(
  'FILE IN TREE, NOT APPLIED    :',
  report.migrations.inTreeNotApplied.join(', ') || '(none)',
)

console.log('\n=== TABLE ROW COUNTS ===')
const empties = []
for (const { t, has_ws } of tables) {
  const n = report.total[t]
  const wsCount = report.byWorkspace[t]?.length ?? 0
  if (n === 0) {
    empties.push(t)
    continue
  }
  console.log(
    String(n).padStart(6),
    t.padEnd(28),
    has_ws ? `across ${wsCount} workspace(s)` : '(no workspace_id)',
  )
}
console.log('\nEMPTY TABLES (' + empties.length + '):', empties.join(', '))
