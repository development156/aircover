import { q } from '../lib/db.mjs'
const rows = await q(`
  select c.relname,
         (select count(*) from pg_policy p where p.polrelid=c.oid)::int as policies,
         has_table_privilege('anon', c.oid, 'SELECT') as anon_select,
         has_table_privilege('anon', c.oid, 'INSERT') as anon_insert,
         has_table_privilege('authenticated', c.oid, 'SELECT') as auth_select,
         has_table_privilege('authenticated', c.oid, 'INSERT') as auth_insert
  from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public' and c.relkind='r'`)
const all = rows.length
const anonSel = rows.filter((r) => r.anon_select).length
const anonIns = rows.filter((r) => r.anon_insert).length
console.log(`public tables: ${all}`)
console.log(`  anon has SELECT on ${anonSel}, INSERT on ${anonIns}`)
console.log(
  `  authenticated has SELECT on ${rows.filter((r) => r.auth_select).length}, INSERT on ${rows.filter((r) => r.auth_insert).length}`,
)
console.log(
  'tables where anon LACKS select:',
  rows
    .filter((r) => !r.anon_select)
    .map((r) => r.relname)
    .join(', ') || '(none)',
)
