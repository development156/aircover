#!/usr/bin/env node
/**
 * P3 — every RPC argument is attacker-supplied, and every refusal is proven
 * SEPARATELY, with the row count taken PRIVILEGED afterwards.
 *
 * `{ok:false}` is what the function said. `countPrivileged` is what the
 * database did. An attach can fail two different ways and proving one leaves
 * the other untested, so INSERT, UPDATE and DELETE each get their own probe
 * rather than one "writes are denied" claim.
 *
 * Everything this writes carries MARKER, so anything that unexpectedly lands
 * is findable and removable. Nothing here TRUNCATEs, and no DELETE runs
 * without a WHERE.
 */
import fs from 'node:fs'
import path from 'node:path'

import { countPrivileged, q } from '../lib/db.mjs'
import { WT } from '../lib/env.mjs'
import { mintToken } from '../lib/jwt.mjs'
import { rest } from '../lib/rest.mjs'

const MARKER = 'AUDIT-WT-AUDIT-2026-08-22'
const TTL = 3 * 3600
const NOBODY = '00000000-0000-4000-8000-000000000000' // well-formed uuid belonging to nobody

const findings = []
const record = (o) => {
  findings.push(o)
  const ok = o.refused ? 'REFUSED ' : '!! ALLOWED !!'
  console.log(
    `${ok} ${String(o.probe).padEnd(52)} status=${String(o.status).padEnd(4)} rowsAfter=${o.rowsAfter} ${o.note ?? ''}`,
  )
  if (o.body) console.log(`          body: ${String(o.body).slice(0, 180)}`)
}

// ── identities ──────────────────────────────────────────────────────────────
const opsAdmins = new Set(
  (await q(`select user_id from ops_admins where status='active' and user_id is not null`)).map(
    (r) => r.user_id,
  ),
)
const members = await q(`select workspace_id::text as ws, user_id from workspace_members`)
const victimWs = '6473b616-dbf0-5a27-9d5b-4b67695a9c2c' // Chai & Chapters (Demo)
const attacker = members.find(
  (m) => m.ws !== victimWs && !opsAdmins.has(m.user_id) && m.user_id.startsWith('user_'),
)
const attackerWs = attacker.ws
const TOK = mintToken({ sub: attacker.user_id, ttlSeconds: TTL })

console.log(`victim workspace : ${victimWs}`)
console.log(`attacker         : ${attacker.user_id}  (member of ${attackerWs} only)`)
console.log(`attacker is ops? : ${opsAdmins.has(attacker.user_id)}`)
console.log()

// ═══════════════════════════════════════════════════════════════════════════
// 1. The orphan `public.ledger` — anon holds INSERT/SELECT/UPDATE/DELETE and
//    the only thing between it and the internet is a zero-policy RLS shell.
// ═══════════════════════════════════════════════════════════════════════════
console.log('── public.ledger: anon has full DML grants, zero policies ──')
const ledgerBefore = await q(`select * from public.ledger order by id`)
fs.writeFileSync(
  path.join(WT, 'audit/out/ledger-table-snapshot.json'),
  JSON.stringify(ledgerBefore, null, 2),
)
console.log(`captured ${ledgerBefore.length} row(s) of public.ledger before probing`)
const ledgerCount = () => countPrivileged('ledger')
const before = await ledgerCount()

for (const [who, token] of [
  ['anon', null],
  ['member', TOK],
]) {
  let r = await rest('/ledger?select=*', { token })
  record({
    probe: `SELECT public.ledger as ${who}`,
    status: r.status,
    refused: r.rows === 0,
    rowsAfter: await ledgerCount(),
    body: r.text,
    note: `saw ${r.rows} of ${before} rows`,
  })

  r = await rest('/ledger', {
    token,
    method: 'POST',
    body: { tenant_id: MARKER, at: 1, delta: 999999, reason: MARKER },
  })
  record({
    probe: `INSERT public.ledger as ${who}`,
    status: r.status,
    refused: (await ledgerCount()) === before,
    rowsAfter: await ledgerCount(),
    body: r.text,
  })

  r = await rest(`/ledger?id=eq.${ledgerBefore[0].id}`, {
    token,
    method: 'PATCH',
    body: { delta: 1, reason: MARKER },
    headers: { Prefer: 'return=representation' },
  })
  const afterPatch = await q(`select delta, reason from public.ledger where id=$1`, [
    ledgerBefore[0].id,
  ])
  record({
    probe: `UPDATE public.ledger row 1 as ${who}`,
    status: r.status,
    refused: afterPatch[0]?.delta === ledgerBefore[0].delta,
    rowsAfter: await ledgerCount(),
    body: r.text,
    note: `delta is still ${afterPatch[0]?.delta} (was ${ledgerBefore[0].delta})`,
  })

  r = await rest(`/ledger?id=eq.${ledgerBefore[0].id}`, {
    token,
    method: 'DELETE',
    headers: { Prefer: 'return=representation' },
  })
  const n = await ledgerCount()
  record({
    probe: `DELETE public.ledger row 1 as ${who}`,
    status: r.status,
    refused: n === before,
    rowsAfter: n,
    body: r.text,
  })
}

// charge_if_affordable — SECURITY INVOKER, granted to anon, no workspace scope.
for (const [who, token] of [
  ['anon', null],
  ['member', TOK],
]) {
  const r = await rest('/rpc/charge_if_affordable', {
    token,
    method: 'POST',
    body: { p_cost: 1, p_reason: MARKER, p_job_id: MARKER, p_tenant: 'default' },
  })
  record({
    probe: `rpc charge_if_affordable(tenant=default) as ${who}`,
    status: r.status,
    refused: (await ledgerCount()) === before,
    rowsAfter: await ledgerCount(),
    body: r.text,
  })
}

// ═══════════════════════════════════════════════════════════════════════════
// 2. Privilege escalation: can an ordinary member make themselves an operator?
// ═══════════════════════════════════════════════════════════════════════════
console.log('\n── operator escalation ──')
const opsBefore = await countPrivileged('ops_admins')
for (const [label, body] of [
  ['ops_admin_upsert(self as owner)', { p_email: `${MARKER}@example.invalid`, p_role: 'owner' }],
  ['ops_admin_upsert(bad role)', { p_email: `${MARKER}@example.invalid`, p_role: 'nope' }],
]) {
  const r = await rest('/rpc/ops_admin_upsert', { token: TOK, method: 'POST', body })
  const n = await countPrivileged('ops_admins')
  record({
    probe: label,
    status: r.status,
    refused: n === opsBefore,
    rowsAfter: n,
    body: r.text,
    note:
      r.text.includes('42501') || r.text.includes('not permitted')
        ? 'authorization raised BEFORE the role validation — ordering is correct'
        : 'check the ordering',
  })
}
for (const rpc of ['ops_admin_set_role', 'ops_credit_request_create', 'ops_task_create']) {
  const r = await rest(`/rpc/${rpc}`, {
    token: TOK,
    method: 'POST',
    body:
      rpc === 'ops_admin_set_role'
        ? { p_id: NOBODY, p_role: 'owner' }
        : rpc === 'ops_credit_request_create'
          ? {
              p_workspace_id: victimWs,
              p_amount: 100000,
              p_reason: MARKER,
              p_approver_email: `${MARKER}@example.invalid`,
              p_otp_hash: 'x',
            }
          : { p_title: MARKER, p_detail: MARKER },
  })
  record({
    probe: `rpc ${rpc} as ordinary member`,
    status: r.status,
    refused: r.status >= 400,
    rowsAfter: await countPrivileged('ops_admins'),
    body: r.text,
  })
}

// rls_auto_enable — SECURITY DEFINER, EXECUTE granted to anon.
{
  const r = await rest('/rpc/rls_auto_enable', { token: null, method: 'POST', body: {} })
  record({
    probe: 'rpc rls_auto_enable as anon (DEFINER, granted to anon)',
    status: r.status,
    refused: r.status >= 400,
    rowsAfter: '-',
    body: r.text,
  })
}

// ═══════════════════════════════════════════════════════════════════════════
// 3. Cross-tenant writes on a real tenant table, each operation separately.
// ═══════════════════════════════════════════════════════════════════════════
console.log("\n── cross-tenant writes against the victim's rows ──")
const victimPost = (
  await q(`select id, title, status from posts where workspace_id=$1 limit 1`, [victimWs])
)[0]
const postsBefore = await countPrivileged('posts', 'workspace_id = $1', [victimWs])

let r = await rest('/posts', {
  token: TOK,
  method: 'POST',
  body: { workspace_id: victimWs, title: MARKER, status: 'draft' },
})
record({
  probe: "INSERT posts INTO the victim's workspace",
  status: r.status,
  refused: (await countPrivileged('posts', 'workspace_id = $1', [victimWs])) === postsBefore,
  rowsAfter: await countPrivileged('posts', 'workspace_id = $1', [victimWs]),
  body: r.text,
})

r = await rest(`/posts?id=eq.${victimPost.id}`, {
  token: TOK,
  method: 'PATCH',
  body: { title: MARKER },
  headers: { Prefer: 'return=representation' },
})
const titleNow = (await q(`select title from posts where id=$1`, [victimPost.id]))[0]?.title
record({
  probe: "UPDATE a victim's post",
  status: r.status,
  refused: titleNow === victimPost.title,
  rowsAfter: await countPrivileged('posts', 'id = $1', [victimPost.id]),
  body: r.text,
  note: `title is still ${JSON.stringify(titleNow)}`,
})

r = await rest(`/posts?id=eq.${victimPost.id}`, {
  token: TOK,
  method: 'DELETE',
  headers: { Prefer: 'return=representation' },
})
record({
  probe: "DELETE a victim's post",
  status: r.status,
  refused: (await countPrivileged('posts', 'id = $1', [victimPost.id])) === 1,
  rowsAfter: await countPrivileged('posts', 'id = $1', [victimPost.id]),
  body: r.text,
})

// The confused-deputy shape: a DEFINER RPC handed a foreign workspace id.
console.log('\n── DEFINER RPCs handed hostile arguments ──')
const hostileRpcs = [
  [
    'resolve_brand_memory',
    { p_workspace_id: victimWs, p_payload: { voice: MARKER }, p_source: MARKER },
    'brand_memory',
  ],
  [
    'propose_memory_event',
    { p_workspace_id: victimWs, p_diff: { x: MARKER }, p_evidence_refs: [], p_source: MARKER },
    'memory_events',
  ],
  [
    'upsert_billing_profile',
    { p_workspace_id: victimWs, p_tax_kind: 'none', p_legal_name: MARKER },
    'billing_profiles',
  ],
  ['loop_kill_switch', { p_workspace_id: victimWs, p_also_pause: true }, 'loop_settings'],
  ['playbook_kill_switch', { p_workspace_id: victimWs, p_also_disable: true }, 'playbooks'],
  [
    'bootstrap_workspace',
    { p_name: MARKER, p_slug: MARKER, p_email: `${MARKER}@example.invalid` },
    'workspaces',
  ],
  [
    'upsert_connection',
    { p_workspace_id: victimWs, p_platform: 'x', p_external_account: { id: MARKER }, p_scopes: [] },
    'connections',
  ],
  ['clear_pending_plan_change', { p_workspace_id: victimWs }, 'subscriptions'],
  ['set_pending_plan_change', { p_workspace_id: victimWs, p_plan_id: 'growth' }, 'subscriptions'],
  ['ensure_zernio_profile', { p_workspace_id: victimWs, p_profile_id: MARKER }, 'zernio_profiles'],
]
for (const [name, body, table] of hostileRpcs) {
  const n0 = await countPrivileged(table)
  const res = await rest(`/rpc/${name}`, { token: TOK, method: 'POST', body })
  const n1 = await countPrivileged(table)
  record({
    probe: `rpc ${name}(workspace=victim)`,
    status: res.status,
    refused: n1 === n0 && res.status >= 400,
    rowsAfter: n1,
    body: res.text,
    note: n1 === n0 ? `${table} unchanged at ${n1}` : `${table} MOVED ${n0} -> ${n1}`,
  })
}

// Nulls, nobody's ids, mismatched pairs, SQL-shaped strings.
console.log('\n── malformed / mismatched / injection-shaped arguments ──')
const malformed = [
  [
    'resolve_brand_memory null workspace',
    'resolve_brand_memory',
    { p_workspace_id: null, p_payload: {}, p_source: MARKER },
  ],
  [
    'resolve_brand_memory nobody workspace',
    'resolve_brand_memory',
    { p_workspace_id: NOBODY, p_payload: {}, p_source: MARKER },
  ],
  [
    'resolve_brand_memory sql-shaped source',
    'resolve_brand_memory',
    { p_workspace_id: attackerWs, p_payload: {}, p_source: "'); drop table posts; --" },
  ],
  [
    'ensure_zernio_profile sql-shaped id',
    'ensure_zernio_profile',
    { p_workspace_id: attackerWs, p_profile_id: "x'; drop table connections; --" },
  ],
  [
    'ops_workspace_search sql-shaped',
    'ops_workspace_search',
    { p_query: "%' union select 1,2,3 --" },
  ],
  ['cancel_scheduled_post nobody', 'cancel_scheduled_post', { p_post_id: NOBODY }],
  ['delete_asset nobody', 'delete_asset', { p_asset_id: NOBODY, p_detach: true }],
  [
    'loop_approve_cost nobody',
    'loop_approve_cost',
    { p_cycle_id: NOBODY, p_excluded_briefs: [], p_expected_credits: 0 },
  ],
  [
    'playbook_approve_cost nobody',
    'playbook_approve_cost',
    { p_run_id: NOBODY, p_excluded_items: [], p_expected_credits: 0 },
  ],
]
const tablesWatched = ['posts', 'connections', 'brand_memory', 'assets', 'credit_ledger']
for (const [label, name, body] of malformed) {
  const b = {}
  for (const t of tablesWatched) b[t] = await countPrivileged(t)
  const res = await rest(`/rpc/${name}`, { token: TOK, method: 'POST', body })
  const moved = []
  for (const t of tablesWatched) {
    const n = await countPrivileged(t)
    if (n !== b[t]) moved.push(`${t} ${b[t]}->${n}`)
  }
  record({
    probe: label,
    status: res.status,
    refused: moved.length === 0,
    rowsAfter: moved.length ? moved.join(' ') : 'all watched tables unchanged',
    body: res.text,
  })
}

// ── did anything land? ──────────────────────────────────────────────────────
console.log('\n── sweep for anything this run wrote ──')
const textCols = await q(
  `select table_name, column_name from information_schema.columns
   where table_schema='public' and data_type in ('text','character varying')`,
)
let stray = 0
for (const { table_name, column_name } of textCols) {
  const [{ n }] = await q(
    `select count(*)::int as n from public."${table_name}" where "${column_name}" like $1`,
    [`%${MARKER}%`],
  )
  if (n > 0) {
    stray += n
    console.log(`  !! ${n} row(s) in ${table_name}.${column_name} carry the audit marker`)
  }
}
console.log(
  stray === 0 ? '  clean: no probe wrote a row anywhere.' : `  ${stray} STRAY ROW(S) — clean up.`,
)

fs.writeFileSync(
  path.join(WT, 'audit/out/hostile.json'),
  JSON.stringify({ findings, stray }, null, 2),
)
const allowed = findings.filter((f) => !f.refused)
console.log(`\n=== ${findings.length} probes · ${allowed.length} NOT refused ===`)
for (const a of allowed) console.log('  !!', a.probe, '->', a.status, String(a.body).slice(0, 120))
