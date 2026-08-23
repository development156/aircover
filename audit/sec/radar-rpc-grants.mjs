import { q } from '../lib/db.mjs'
const fns = await q(`
  select n.nspname as schema, p.proname, pg_get_function_identity_arguments(p.oid) as args,
         array(select r.rolname from pg_roles r where has_function_privilege(r.rolname, p.oid, 'EXECUTE')
               and r.rolname in ('anon','authenticated','service_role','public')) as can_execute
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where p.proname like '%radar%' or p.proname like '%competitor%'
  order by 1,2`)
console.log(JSON.stringify(fns, null, 1))
