/**
 * The ROLLBACK text must restore what production actually has, not what this
 * branch's migration file says. Three versions are applied in prod with no file
 * here; if any of them did a `create or replace` on these functions, a rollback
 * quoting the branch file would revert another lane's change.
 */
import { q } from '../lib/db.mjs'
for (const fn of [
  'app.ops_active_owner_count',
  'public.ops_admin_revoke',
  'public.ops_admin_set_role',
]) {
  const r = await q(
    `select pg_get_functiondef(p.oid) as def
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname = split_part($1,'.',1) and p.proname = split_part($1,'.',2)`,
    [fn],
  )
  console.log(`\n════════ LIVE ${fn} ════════`)
  console.log(r[0]?.def ?? '(absent)')
}
