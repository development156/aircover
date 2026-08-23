/**
 * WHAT DID THIS AUDIT LEAVE BEHIND?
 *
 * A diff of two counts is not an answer: `wt-perf` has been running a server
 * against this same production database for the whole session, so rows move for
 * reasons that are not me. Every non-zero delta is therefore ATTRIBUTED by
 * looking at the new rows themselves, not explained away.
 */
import fs from 'node:fs'
import path from 'node:path'

import { q } from '../lib/db.mjs'
import { WT } from '../lib/env.mjs'

const read = (label) =>
  JSON.parse(fs.readFileSync(path.join(WT, 'audit', 'out', `rowcount-${label}.json`), 'utf8'))
const before = read('before')
const after = read('after')

const tables = [...new Set([...Object.keys(before.counts), ...Object.keys(after.counts)])].sort()
const moved = tables
  .map((t) => ({ table: t, before: before.counts[t] ?? 0, after: after.counts[t] ?? 0 }))
  .filter((r) => r.before !== r.after)

console.log(`window: ${before.at} → ${after.at}`)
console.log(`tables: ${tables.length}   moved: ${moved.length}`)
console.log(
  `total rows: ${Object.values(before.counts).reduce((a, b) => a + b, 0)} → ${Object.values(after.counts).reduce((a, b) => a + b, 0)}\n`,
)

for (const row of moved) {
  console.log(
    `── ${row.table}: ${row.before} → ${row.after} (${row.after - row.before >= 0 ? '+' : ''}${row.after - row.before})`,
  )
  const cols = await q(
    `select column_name from information_schema.columns
      where table_schema='public' and table_name=$1 and column_name in
        ('created_at','fetched_at','detected_at','captured_at','updated_at')`,
    [row.table],
  )
  const stamp = cols[0]?.column_name
  if (!stamp) {
    console.log('   (no timestamp column — cannot attribute)')
    continue
  }
  const fresh = await q(
    `select * from public."${row.table}" where "${stamp}" >= $1 order by "${stamp}" desc limit 5`,
    [before.at],
  )
  for (const r of fresh) {
    // Names and shapes only — this is a customer database.
    const keys = ['task', 'provider', 'status', 'workspace_id', 'action', 'kind', 'outcome']
      .filter((k) => k in r)
      .map((k) => `${k}=${String(r[k]).slice(0, 40)}`)
    console.log(`   ${String(r[stamp])}  ${keys.join(' ')}`)
  }
}
if (moved.length === 0) console.log('nothing moved.')
