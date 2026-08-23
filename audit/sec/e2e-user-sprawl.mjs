import { q } from '../lib/db.mjs'
const j = (x) => JSON.stringify(x, null, 1)
console.log('ops_audit_log totals by action:')
console.log(
  j(
    await q(`select action, count(*)::int n, min(created_at) first, max(created_at) last
  from ops_audit_log group by 1 order by 2 desc limit 8`),
  ),
)
console.log('\ndistinct users named by user.created rows:')
console.log(
  j(
    await q(`select count(distinct target_id)::int distinct_users, count(*)::int rows
  from ops_audit_log where action = 'user.created'`),
  ),
)
console.log('\nrows that survived: users_profile / workspaces / workspace_members')
console.log(
  j(
    await q(`select
   (select count(*)::int from users_profile) as users_profile,
   (select count(*)::int from workspaces) as workspaces,
   (select count(*)::int from workspace_members) as workspace_members`),
  ),
)
console.log('\nworkspaces with no member at all (stranded):')
console.log(
  j(
    await q(`select count(*)::int n from workspaces w
  where not exists (select 1 from workspace_members m where m.workspace_id = w.id)`),
  ),
)
