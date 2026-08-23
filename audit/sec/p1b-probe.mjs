/**
 * P1b — is "RLS on, zero policies" a DECISION or an OMISSION, and does the
 * denial still hold?
 *
 * ⚠ THE BLIND-PROBE TRAP ⚠ A token that can see nothing anywhere returns zero
 * for every table and looks like perfect isolation. So the attacker here is a
 * REAL member — the one owning the MOST rows — and the run REFUSES to report
 * anything until that member has been shown to SEE rows it is entitled to.
 */
import fs from 'node:fs'
import path from 'node:path'

import { q } from '../lib/db.mjs'
import { WT } from '../lib/env.mjs'
import { mintToken } from '../lib/jwt.mjs'
import { restCount } from '../lib/rest.mjs'

const NO_POLICY = await q(`
  select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname='public' and c.relkind='r' and c.relrowsecurity
    and (select count(*) from pg_policy p where p.polrelid=c.oid) = 0
  order by 1`)

// The member owning the most rows across the biggest tenant tables — a member
// with none proves nothing at all.
const busiest = await q(`
  select wm.user_id, wm.workspace_id, count(p.id)::int as posts
    from workspace_members wm
    left join posts p on p.workspace_id = wm.workspace_id
   group by 1, 2 order by posts desc limit 1`)
const who = busiest[0]
if (!who) throw new Error('no workspace member found — cannot probe as a real member')

const token = mintToken({ sub: who.user_id })

// ── THE CONTROL. Refuse to continue unless this token SEES rows. ──
const control = await restCount(`/posts?select=id&workspace_id=eq.${who.workspace_id}`, { token })
if (!(control.count > 0)) {
  throw new Error(
    `the control failed: the busiest member sees ${control.count} posts (status ${control.status}). ` +
      'A probe that sees nothing everywhere cannot tell a policy from a broken token.',
  )
}
console.log(
  `control: member ${who.user_id} sees ${control.count} of its own posts — probe is live\n`,
)

const rows = []
for (const { relname } of NO_POLICY) {
  const privileged = (await q(`select count(*)::int as n from public."${relname}"`))[0].n
  const asMember = await restCount(`/${relname}?select=*`, { token })
  const asAnon = await restCount(`/${relname}?select=*`)
  rows.push({
    table: relname,
    privileged,
    member: { status: asMember.status, count: asMember.count },
    anon: { status: asAnon.status, count: asAnon.count },
  })
  console.log(
    `${relname.padEnd(24)} real=${String(privileged).padStart(5)}  member=${asMember.status}/${asMember.count}  anon=${asAnon.status}/${asAnon.count}`,
  )
}

const leaked = rows.filter((r) => (r.member.count ?? 0) > 0 || (r.anon.count ?? 0) > 0)
console.log(`\ntables that returned a row to a member or to anon: ${leaked.length}`)
fs.writeFileSync(
  path.join(WT, 'audit', 'out', 'p1b-nopolicy-probe.json'),
  JSON.stringify({ member: who, control: control.count, rows }, null, 1),
)
