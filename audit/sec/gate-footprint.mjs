/**
 * What THIS AUDIT'S OWN GATE left in production.
 *
 * The E2E suite mints Clerk users and creates workspaces against the production
 * database — that is what SAHODA_E2E_ACK_TARGET exists to acknowledge, not a
 * surprise. The brief says clean up what you create; the brief ALSO says run no
 * irrecoverable SQL, and a workspace delete cascades across a dozen tables. So
 * this names the rows precisely and writes the predicate, and does not run it.
 */
import { q } from '../lib/db.mjs'
const since = '2026-08-23T04:24:24.043Z' // the `after` snapshot, taken before the gate
console.log('workspaces created after the pre-gate snapshot:')
console.log(
  JSON.stringify(
    await q(
      `select w.id, w.name, w.created_at,
          (select count(*)::int from workspace_members m where m.workspace_id = w.id) as members,
          (select count(*)::int from posts p where p.workspace_id = w.id) as posts
     from workspaces w where w.created_at >= $1 order by w.created_at`,
      [since],
    ),
    null,
    1,
  ),
)
console.log('\nusers_profile created after it:')
console.log(
  JSON.stringify(
    await q(
      `select user_id, created_at from users_profile where created_at >= $1 order by created_at`,
      [since],
    ),
    null,
    1,
  ),
)
console.log('\nops_audit_log rows added, by action:')
console.log(
  JSON.stringify(
    await q(
      `select action, count(*)::int n from ops_audit_log where created_at >= $1 group by 1 order by 2 desc`,
      [since],
    ),
    null,
    1,
  ),
)
