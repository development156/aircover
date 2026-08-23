import { q } from '../lib/db.mjs'
const r = await q(`select pg_get_functiondef(p.oid) as def from pg_proc p
  join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='ops_application_link_user'`)
console.log(r[0]?.def ?? '(absent)')
