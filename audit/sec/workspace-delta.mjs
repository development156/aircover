import { q } from '../lib/db.mjs'
console.log('newest 5 workspaces:')
console.log(
  JSON.stringify(
    await q(`select id, name, created_at from workspaces order by created_at desc limit 5`),
    null,
    1,
  ),
)
console.log(
  '\ncurrent counts:',
  JSON.stringify(
    (
      await q(
        `select (select count(*)::int from workspaces) w,
          (select count(*)::int from workspace_members) m,
          (select count(*)::int from users_profile) u`,
      )
    )[0],
  ),
)
