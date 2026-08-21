#!/usr/bin/env node
/** Is the ops_credit_requests result an operator policy, or a real leak? Measure. */
import { q } from '../lib/db.mjs'
import { mintToken } from '../lib/jwt.mjs'
import { restCount } from '../lib/rest.mjs'

console.log('=== policy on ops_credit_requests ===')
for (const p of await q(
  `select policyname, cmd, roles::text as roles, qual, with_check
   from pg_policies where schemaname='public' and tablename='ops_credit_requests'`,
))
  console.log(JSON.stringify(p, null, 1))

console.log('\n=== app.is_ops_admin source ===')
const fn = await q(
  `select p.proname, pg_get_functiondef(p.oid) as def
   from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='app' and p.proname like '%ops%admin%'`,
)
for (const f of fn) console.log(f.def)

console.log('\n=== ops_admins rows ===')
for (const r of await q(`select * from ops_admins order by 1`)) console.log(JSON.stringify(r))

console.log('\n=== ops_credit_requests rows (privileged ground truth) ===')
for (const r of await q(
  `select id, workspace_id::text, status, requested_by, amount from ops_credit_requests`,
))
  console.log(JSON.stringify(r))

// The two identities the sweep used.
const OWNER = 'user_3GrFkWZEcP63riPoPzMadsAzBaP'
const ATTACKER = (
  await q(
    `select user_id from workspace_members
     where workspace_id <> (select workspace_id from ops_credit_requests limit 1)
     order by user_id limit 1`,
  )
)[0].user_id
console.log('\nattacker identity used by the sweep:', ATTACKER)
console.log(
  'is that identity an ops admin?',
  JSON.stringify(await q(`select * from ops_admins where user_id = $1`, [ATTACKER])),
)

console.log('\n=== a NON-ops-admin member of another workspace ===')
const plain = (
  await q(
    `select m.user_id from workspace_members m
     where not exists (select 1 from ops_admins a where a.user_id = m.user_id)
       and m.workspace_id <> (select workspace_id from ops_credit_requests limit 1)
     order by m.user_id limit 1`,
  )
)[0]
console.log('plain member:', plain?.user_id)
if (plain) {
  const r = await restCount('/ops_credit_requests?select=id', {
    token: mintToken({ sub: plain.user_id, ttlSeconds: 3600 }),
  })
  console.log('plain member reading ops_credit_requests ->', r.status, 'count=', r.count)
}
const r2 = await restCount('/ops_credit_requests?select=id', {
  token: mintToken({ sub: ATTACKER, ttlSeconds: 3600 }),
})
console.log('sweep attacker reading ops_credit_requests ->', r2.status, 'count=', r2.count)
const r3 = await restCount('/ops_credit_requests?select=id')
console.log('anon reading ops_credit_requests ->', r3.status, 'count=', r3.count)
