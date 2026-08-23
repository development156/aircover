import { q } from '../lib/db.mjs'
const j = (x) => JSON.stringify(x, null, 1)
console.log(
  j(
    await q(`select actor, target_table, target_id, count(*)::int n,
    min(created_at) first, max(created_at) last
  from ops_audit_log where action='user.created'
  group by 1,2,3 order by 4 desc limit 3`),
  ),
)
console.log('\nmeta of the newest row:')
console.log(
  j(
    await q(
      `select meta from ops_audit_log where action='user.created' order by created_at desc limit 1`,
    ),
  ),
)
console.log('\nshare of the whole table:')
console.log(
  j(
    await q(`select count(*) filter (where action='user.created')::int as floods,
   count(*)::int as total from ops_audit_log`),
  ),
)
