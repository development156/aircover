import { q } from '../lib/db.mjs'
const t = await q(`select relname from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public' and c.relkind='r' and (relname like '%competitor%' or relname like 'radar%') order by 1`)
console.log('tables:', t.map((r) => r.relname).join(', '))
for (const { relname } of t) {
  const cols = await q(
    `select column_name from information_schema.columns where table_schema='public' and table_name=$1 order by ordinal_position`,
    [relname],
  )
  console.log(`\n${relname}: ${cols.map((c) => c.column_name).join(', ')}`)
  const rows = await q(`select * from public."${relname}" limit 5`)
  console.log(JSON.stringify(rows).slice(0, 1200))
}
