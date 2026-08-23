import { q } from '../lib/db.mjs'
console.log('ops_audit_log rows per hour today, by action:')
console.log(
  JSON.stringify(
    await q(`
  select date_trunc('hour', created_at) as hour, action, count(*)::int as n
    from ops_audit_log
   where created_at > now() - interval '12 hours'
   group by 1,2 order by 1 desc, 3 desc limit 20`),
    null,
    1,
  ),
)
console.log(
  '\nworkspaces deleted in the window (by absence): current count',
  (await q(`select count(*)::int n from workspaces`))[0].n,
)
