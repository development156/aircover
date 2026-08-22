import { q } from '../lib/db.mjs'
console.log(
  'app.ops_active_owner_count() says:',
  (await q(`select app.ops_active_owner_count() as n`))[0].n,
)
console.log(
  'active owners WITH a linked user_id:',
  (
    await q(
      `select count(*)::int n from ops_admins where status='active' and role='owner' and user_id is not null`,
    )
  )[0].n,
)
console.log(
  'active seats with user_id NULL:',
  JSON.stringify(
    await q(
      `select id, email, role from ops_admins where status='active' and user_id is null order by created_at`,
    ),
    null,
    1,
  ),
)
