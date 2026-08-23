#!/usr/bin/env node
import { createHmac } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'

/**
 * The live tenant-isolation matrix.
 *
 *   node packages/db/scripts/rls-live-matrix.mjs
 *
 * ── WHY A PASS COUNT WAS NOT ENOUGH ──────────────────────────────────────────
 * The isolation suite reported 47/47 green. An audit re-read it and found the
 * real number was 31 PROVEN and 16 UNEXERCISED, because "the attacker saw
 * nothing" and "there was nothing to see" render identically in a pass count.
 * MEASURED 2026-08-22: the 16 are exactly the 16 tenant tables that hold ZERO
 * rows. An empty table refuses nothing.
 *
 * So every verdict here carries the row count it was reached with, and a table
 * with no foreign row is named UNEXERCISED — never PROVEN, never PASS.
 *
 * ── THE THREE WAYS A HARNESS LIKE THIS CONFIRMS ITSELF ───────────────────────
 * Each is made impossible by construction rather than watched for:
 *
 *  1. Counting rows through the token that was just refused. The attacker probes
 *     over PostgREST; the counting is a separate service-role Postgres
 *     connection. Two different credentials, two different protocols.
 *
 *  2. Picking a platform operator as the attacker, then crying leak at a policy
 *     working correctly. The attacker is a SYNTHETIC Clerk id that appears in no
 *     table at all, and the run proves that from the service-role side — printing
 *     `memberships=0 ops_seats=0 owned=0` — before a single probe runs. If any of
 *     the three is non-zero it exits 2 and reports nothing.
 *
 *  3. One raised exception aborting a transaction, so every later probe reads
 *     the abort as a refusal. There is NO shared transaction: one HTTP request
 *     per table.
 *
 * ── AND THE CONTROL, WITHOUT WHICH ZERO PROVES NOTHING ───────────────────────
 * A blind probe returns zero rows for every table and looks like perfect
 * isolation. So the run first probes as a REAL member who owns rows, and
 * requires that it sees them and only them. MEASURED: a member of the demo
 * workspace sees 5 of 123 posts, all their own; the stranger sees 0 on the same
 * channel. Only workspace_id is selected — no customer content is read.
 */

const ROOT = resolve(import.meta.dirname, '../../..')
const require = createRequire(resolve(ROOT, 'packages/db/package.json'))
const { Client } = require('pg')

function env() {
  const out = {}
  for (const line of readFileSync(resolve(ROOT, '.env'), 'utf8').split('\n')) {
    const t = line.trim()
    if (!t || t.startsWith('#')) continue
    const i = t.indexOf('=')
    if (i === -1) continue
    out[t.slice(0, i).trim()] = t
      .slice(i + 1)
      .trim()
      .replace(/^["']|["']$/g, '')
      .replace(/\s+#.*$/, '')
  }
  return out
}

const E = env()
const REST = `${new URL(E.NEXT_PUBLIC_SUPABASE_URL).origin}/rest/v1`

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url')

/** HS256 against SUPABASE_JWT_SECRET, which Supabase honours for `authenticated`. */
export function mintToken(sub) {
  const now = Math.floor(Date.now() / 1000)
  const head = b64({ alg: 'HS256', typ: 'JWT' })
  const body = b64({ sub, role: 'authenticated', aud: 'authenticated', iat: now, exp: now + 900 })
  const sig = createHmac('sha256', E.SUPABASE_JWT_SECRET)
    .update(`${head}.${body}`)
    .digest('base64url')
  return `${head}.${body}.${sig}`
}

/**
 * PROVEN needs a foreign row that EXISTS and is HIDDEN. Everything else is named
 * for what it is — including the two states that are easy to mistake for a pass.
 */
export function classify(totalRows, probe) {
  if (probe.error) return { state: 'UNMEASURED', note: probe.error }
  // PostgREST answers 404 / PGRST205 for a table it does not expose. Nothing was
  // tested. Reading that as a refusal is the same defect as reading "column does
  // not exist" as the guard working.
  if (probe.status === 404 || probe.body?.code === 'PGRST205') {
    return { state: 'NOT-EXPOSED', note: `PostgREST ${probe.status}` }
  }
  if (probe.status === 401 || probe.status === 403) {
    return { state: 'REFUSED-HARD', note: `${probe.status} — the token never reached a policy` }
  }
  if (probe.status !== 200) return { state: 'UNEXPECTED', note: `status ${probe.status}` }
  if (probe.rows > 0) return { state: 'LEAK', note: `attacker read ${probe.rows} foreign row(s)` }
  if (totalRows === 0) {
    return { state: 'UNEXERCISED', note: 'table is EMPTY — nothing hidden, nothing proven' }
  }
  return { state: 'PROVEN', note: `${totalRows} foreign row(s) exist; attacker saw 0` }
}

async function probeTable(table, token) {
  try {
    const res = await fetch(`${REST}/${table}?select=workspace_id&limit=5`, {
      headers: { apikey: E.NEXT_PUBLIC_SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` },
      cache: 'no-store',
    })
    const text = await res.text()
    let body
    try {
      body = JSON.parse(text)
    } catch {
      body = text
    }
    return { status: res.status, rows: Array.isArray(body) ? body.length : null, body }
  } catch (error) {
    return { status: 0, rows: null, error: error.message }
  }
}

// ── run ──────────────────────────────────────────────────────────────────────
if (process.argv[1]?.endsWith('rls-live-matrix.mjs')) {
  const db = new Client({
    connectionString: E.SUPABASE_DB_URL,
    ssl: { rejectUnauthorized: false },
  })
  await db.connect()
  // `begin read only` rather than `set default_transaction_read_only` — through
  // the pooler that session setting is handed to the NEXT client.
  await db.query('begin read only')

  const attacker = `user_rlsmatrix_probe_${Date.now().toString(36)}`
  const stranger = (
    await db.query(
      `select (select count(*)::int from workspace_members where user_id=$1) memberships,
              (select count(*)::int from ops_admins       where user_id=$1) ops_seats,
              (select count(*)::int from workspaces       where created_by=$1) owned`,
      [attacker],
    )
  ).rows[0]

  console.log(`\n  attacker ${attacker}`)
  console.log(
    `  memberships=${stranger.memberships} ops_admins=${stranger.ops_seats} owned=${stranger.owned}`,
  )
  if (stranger.memberships || stranger.ops_seats || stranger.owned) {
    console.error('\n  REFUSED: the attacker is not a stranger, so no verdict would mean anything.')
    process.exit(2)
  }

  // THE CONTROL. A probe that cannot see anything reports perfect isolation.
  const member = (
    await db.query(`select wm.user_id, wm.workspace_id, count(p.id)::int n
                    from workspace_members wm join posts p on p.workspace_id=wm.workspace_id
                    group by 1,2 order by 3 desc limit 1`)
  ).rows[0]
  if (member) {
    const saw = await probeTable('posts', mintToken(member.user_id))
    const seen = [...new Set((saw.body ?? []).map((r) => r.workspace_id))]
    const ok = saw.rows > 0 && seen.length === 1 && seen[0] === member.workspace_id
    console.log(
      `  CONTROL  a member of a workspace holding ${member.n} posts sees ${saw.rows}, ` +
        `from ${seen.length} workspace(s) — ${ok ? 'the channel can see rows' : 'CHANNEL IS BLIND'}`,
    )
    if (!ok) {
      console.error('\n  REFUSED: the probe cannot see rows even when permitted to.')
      process.exit(2)
    }
  }

  const tables = (
    await db.query(`select c.relname from pg_class c
      join pg_namespace n on n.oid=c.relnamespace
      join pg_attribute a on a.attrelid=c.oid and a.attname='workspace_id'
                          and a.attnum>0 and not a.attisdropped
      where n.nspname='public' and c.relkind='r' order by 1`)
  ).rows.map((r) => r.relname)

  // ENUMERATED FROM THE CATALOG, never a list. A hand-written list cannot see a
  // table arrive in a later lane — which is how billing_profiles and loop_cycles
  // were found never to have proved isolation at all.
  console.log(`\n  ${tables.length} tenant tables, enumerated from the catalog\n`)

  const token = mintToken(attacker)
  const tally = {}
  for (const t of tables) {
    const probe = await probeTable(t, token)
    const total = (await db.query(`select count(*)::int n from public."${t}"`)).rows[0].n
    const v = classify(total, probe)
    tally[v.state] = (tally[v.state] ?? 0) + 1
    console.log(
      `  ${v.state.padEnd(12)} ${t.padEnd(28)} ${String(total).padStart(5)} rows · ${v.note}`,
    )
  }

  // Every workspace-scoped view must run as the CALLER. Without
  // security_invoker a view runs as its owner and hands one tenant another's rows.
  const views = (
    await db.query(`select c.relname, c.reloptions::text opts,
                           pg_get_viewdef(c.oid) ~* 'workspace_id' scoped
                    from pg_class c join pg_namespace n on n.oid=c.relnamespace
                    where n.nspname='public' and c.relkind in ('v','m') order by 1`)
  ).rows
  console.log(`\n  ${views.length} view(s):`)
  let unsafeViews = 0
  for (const v of views) {
    const invoker = /security_invoker=(true|on)/.test(v.opts ?? '')
    if (v.scoped && !invoker) unsafeViews += 1
    console.log(
      `    ${v.scoped && !invoker ? 'RISK' : 'ok  '} ${v.relname.padEnd(32)} scoped=${v.scoped} security_invoker=${invoker}`,
    )
  }

  await db.query('rollback')
  await db.end()

  console.log(`\n  ${JSON.stringify(tally)}   views missing security_invoker: ${unsafeViews}\n`)
  const bad = (tally.LEAK ?? 0) + (tally.UNMEASURED ?? 0) + (tally.UNEXPECTED ?? 0) + unsafeViews
  if (bad > 0) process.exit(1)
  // UNEXERCISED is not a failure and not a pass. It exits 3 so a caller can tell
  // "nothing leaked" from "we proved isolation for every table".
  if (tally.UNEXERCISED) process.exit(3)
}
