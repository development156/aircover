import { q } from '../lib/db.mjs'
const j = (x) => JSON.stringify(x, null, 1)

console.log('── RLS ENABLED, ZERO POLICIES ──')
console.log(
  j(
    await q(`
  select c.relname,
         (select count(*) from pg_policy p where p.polrelid=c.oid)::int as policies,
         c.relforcerowsecurity as forced
  from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public' and c.relkind='r' and c.relrowsecurity
    and (select count(*) from pg_policy p where p.polrelid=c.oid)=0
  order by 1`),
  ),
)

console.log('── RLS DISABLED ON A PUBLIC TABLE ──')
console.log(
  j(
    await q(`
  select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public' and c.relkind='r' and not c.relrowsecurity order by 1`),
  ),
)

console.log('── ops_admins ──')
console.log(j(await q(`select * from public.ops_admins order by created_at`)))

console.log('── ai_provider_logs shape ──')
console.log(
  j(
    await q(`select column_name, data_type, is_nullable from information_schema.columns
  where table_schema='public' and table_name='ai_provider_logs' order by ordinal_position`),
  ),
)
console.log('rows:', j(await q(`select count(*)::int n from public.ai_provider_logs`)))
console.log(
  'grants:',
  j(
    await q(`select grantee, privilege_type from information_schema.role_table_grants
  where table_schema='public' and table_name='ai_provider_logs' order by 1,2`),
  ),
)
