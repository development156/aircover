/**
 * RLS ENABLED WITH ZERO POLICIES — eleven tables, not the one the last audit named.
 *
 * "Fails closed" is true and is not the same as "governed": a table in this state
 * denies EVERY authenticated read, so a feature that ever needs to read it breaks
 * with an empty array rather than an error, and nobody can tell that from "you
 * have no rows". This says, per table, whether that is the DESIGN (service-role
 * only, written by a SECURITY DEFINER function) or an OMISSION (tenant data the
 * app reads through a user token).
 */
import { q } from '../lib/db.mjs'

const rows = await q(`
  select c.relname,
         (select count(*) from pg_policy p where p.polrelid = c.oid)::int as policies,
         (select count(*) from information_schema.columns col
           where col.table_schema='public' and col.table_name=c.relname
             and col.column_name='workspace_id')::int as has_workspace_id,
         array(select r.rolname from pg_roles r
                where r.rolname in ('anon','authenticated')
                  and has_table_privilege(r.rolname, c.oid, 'SELECT')) as select_granted_raw
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname='public' and c.relkind='r' and c.relrowsecurity
    and (select count(*) from pg_policy p where p.polrelid=c.oid) = 0
  order by 1`)

for (const r of rows) {
  const n = (await q(`select count(*)::int as n from public."${r.relname}"`))[0].n
  console.log(
    `${r.relname.padEnd(24)} rows=${String(n).padStart(6)}  workspace_id=${r.has_workspace_id ? 'yes' : 'no '}  select-granted-to=${String(r.select_granted_raw).replace(/[{}]/g, '') || '(none)'}`,
  )
}
