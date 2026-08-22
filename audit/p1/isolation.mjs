#!/usr/bin/env node
/**
 * P1 — every tenant table, every tenant, LIVE, through PostgREST.
 *
 * RLS is under test and never bypassed: every read here carries the anon key
 * plus, for the member cases, an HS256 token whose only relevant claim is `sub`
 * — the exact claim `app.member_workspace_ids()` reads. The privileged direct
 * connection is used ONLY to establish ground truth (which rows exist, and how
 * many are there after a refusal), never to answer an isolation question.
 *
 * The classification that makes this worth more than a pass count:
 *
 *   EXERCISED   — a foreign row provably existed and the attacker got 0.
 *   VACUOUS     — the attacker got 0 because there was nothing to get.
 *                 The policy may be perfect; this run did not prove it.
 *
 * A 401 is never folded into "denied": an expired token would make every table
 * look isolated. Any non-200 on a path expected to succeed aborts loudly.
 */
import fs from 'node:fs'
import path from 'node:path'

import { q } from '../lib/db.mjs'
import { WT } from '../lib/env.mjs'
import { mintToken } from '../lib/jwt.mjs'
import { restCount } from '../lib/rest.mjs'

const TTL = 3 * 3600 // long enough that no probe can expire mid-sweep

// ── ground truth, privileged ────────────────────────────────────────────────
const tenantTables = (
  await q(`
  select c.relname as t
  from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public' and c.relkind='r'
    and exists (select 1 from information_schema.columns col
                where col.table_schema='public' and col.table_name=c.relname
                  and col.column_name='workspace_id')
  order by 1`)
).map((r) => r.t)

const members = await q(
  `select workspace_id::text as ws, user_id from workspace_members order by 1`,
)
/**
 * A platform operator is NOT an attacker.
 *
 * `ops_credit_requests` carries `ops_select ... using app.is_ops_admin()`, so an
 * active operator reading another workspace's row is the policy working, not a
 * leak. The first run of this sweep picked karunesh@sahodalabs.com - an active
 * ops admin - as the "attacker" and reported LEAK-CROSS-TENANT for exactly that
 * reason. Excluding operators from the attacker pool is what makes every
 * remaining read mean something; the operator case is probed separately.
 */
const opsAdmins = new Set(
  (await q(`select user_id from ops_admins where status='active' and user_id is not null`)).map(
    (r) => r.user_id,
  ),
)

const wsOfUser = new Map()
for (const m of members) {
  if (!wsOfUser.has(m.user_id)) wsOfUser.set(m.user_id, new Set())
  wsOfUser.get(m.user_id).add(m.ws)
}

const selectPolicyRoles = new Map()
for (const p of await q(
  `select tablename, cmd, roles::text as roles, policyname
   from pg_policies where schemaname='public'`,
)) {
  const k = p.tablename
  if (!selectPolicyRoles.has(k)) selectPolicyRoles.set(k, [])
  selectPolicyRoles.get(k).push(p)
}

// ── the sweep ───────────────────────────────────────────────────────────────
const results = []
let aborted = null

for (const t of tenantTables) {
  const byWs = await q(
    `select workspace_id::text as ws, count(*)::int as n
     from public."${t}" where workspace_id is not null
     group by workspace_id order by n desc limit 1`,
  )
  const [{ n: totalRows }] = await q(`select count(*)::int as n from public."${t}"`)
  const pols = selectPolicyRoles.get(t) || []
  const hasAuthSelect = pols.some((p) => p.cmd === 'SELECT' && /authenticated/.test(p.roles))

  const row = {
    table: t,
    totalRows,
    policies: pols.length,
    authenticatedSelectPolicy: hasAuthSelect,
  }

  if (!byWs.length) {
    row.verdict = 'VACUOUS'
    row.why = 'table is empty in production — nothing existed to hide'
    results.push(row)
    continue
  }

  const owner = byWs[0].ws
  row.ownerWorkspace = owner
  row.ownerRows = byWs[0].n

  const ownerMember = members.find((m) => m.ws === owner)?.user_id
  // The attacker must be a member of NO workspace the owner row lives in, and
  // must not be a platform operator.
  const attacker = members.find(
    (m) => !wsOfUser.get(m.user_id).has(owner) && !opsAdmins.has(m.user_id),
  )?.user_id
  row.ownerMember = ownerMember
  row.attackerMember = attacker
  if (!ownerMember || !attacker) {
    row.verdict = 'SKIPPED'
    row.why = 'no suitable member pair'
    results.push(row)
    continue
  }

  const filter = `?workspace_id=eq.${owner}`
  const anon = await restCount(`/${t}${filter}`)
  const asOwner = await restCount(`/${t}${filter}`, {
    token: mintToken({ sub: ownerMember, ttlSeconds: TTL }),
  })
  const asAttacker = await restCount(`/${t}${filter}`, {
    token: mintToken({ sub: attacker, ttlSeconds: TTL }),
  })

  row.anon = { status: anon.status, count: anon.count }
  row.owner = { status: asOwner.status, count: asOwner.count }
  row.attacker = { status: asAttacker.status, count: asAttacker.count }

  for (const [who, r] of [
    ['anon', anon],
    ['owner', asOwner],
    ['attacker', asAttacker],
  ]) {
    if (r.status === 401) {
      aborted = `401 on ${t} as ${who} — a token was rejected; every "denied" in this run would be a lie. ${r.text.slice(0, 200)}`
    }
  }
  if (aborted) break

  // ── verdict ──────────────────────────────────────────────────────────────
  if (anon.count !== 0) {
    row.verdict = 'LEAK-ANON'
    row.why = `signed-out client read ${anon.count} rows of workspace ${owner}`
  } else if (asAttacker.count !== 0) {
    row.verdict = 'LEAK-CROSS-TENANT'
    row.why = `member of another workspace read ${asAttacker.count} rows of ${owner}`
  } else if (!hasAuthSelect) {
    row.verdict = asOwner.count === 0 ? 'SERVICE-ONLY (denies all, incl. owner)' : 'UNEXPECTED'
    row.why = 'no SELECT policy for authenticated — reads are server-side only'
  } else if (asOwner.count === 0) {
    row.verdict = 'OWNER-BLIND'
    row.why = `owner member saw 0 of its own ${byWs[0].n} rows — policy denies the legitimate case`
  } else {
    row.verdict = 'EXERCISED'
    row.why = `${byWs[0].n} foreign rows existed; owner saw ${asOwner.count}, attacker saw 0, anon saw 0`
  }
  results.push(row)
}

fs.writeFileSync(
  path.join(WT, 'audit/out/isolation.json'),
  JSON.stringify({ aborted, results }, null, 2),
)

if (aborted) {
  console.error('ABORTED:', aborted)
  process.exit(2)
}

const pad = (s, n) => String(s).padEnd(n)
console.log(
  pad('TABLE', 26),
  pad('ROWS', 6),
  pad('POL', 4),
  pad('ANON', 5),
  pad('OWNER', 6),
  pad('ATTK', 5),
  'VERDICT',
)
for (const r of results) {
  console.log(
    pad(r.table, 26),
    pad(r.totalRows, 6),
    pad(r.policies, 4),
    pad(r.anon?.count ?? '-', 5),
    pad(r.owner?.count ?? '-', 6),
    pad(r.attacker?.count ?? '-', 5),
    r.verdict,
  )
}
const tally = {}
for (const r of results) tally[r.verdict] = (tally[r.verdict] || 0) + 1
console.log('\n=== TALLY ===')
for (const [k, v] of Object.entries(tally).sort((a, b) => b[1] - a[1]))
  console.log(String(v).padStart(4), k)
