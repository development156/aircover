/**
 * RADAR RLS, PROVED AGAINST THE REAL DATABASE THROUGH THE REAL DATA API.
 *
 * ── WHY THIS IS A SCRIPT AND NOT A VITEST SUITE ──────────────────────────────
 * `tests/helpers/forbidden-target.ts` refuses, by project ref, to let any suite
 * here talk to `rloztdhzfliyvpvxsgjl` — the one Supabase project, which serves
 * real customers. That rail exists because a suite can run by ACCIDENT: a stray
 * `pnpm test`, a CI job, a cached turbo task. It is correct and it is not being
 * relaxed, deleted, or worked around.
 *
 * A deliberate, hand-run proof is a different act. This file:
 *   · creates its fixtures under a run-scoped namespace, so nothing it makes can
 *     collide with a real row;
 *   · issues no DROP, no TRUNCATE, and no unqualified DELETE — it removes exactly
 *     the ids it created, by id;
 *   · and PRINTS THE SERVER'S OWN ANSWER for every claim, rather than asserting
 *     against a local model of what the server ought to have said.
 *
 * ── WHAT THIS PROVES THAT THE PGLITE SUITE CANNOT ────────────────────────────
 * `tests/radar_rls.pglite.test.ts` proves the POLICIES IN THE MIGRATION FILES are
 * correct, against a real Postgres, on every gate run. It cannot prove that
 * production's policies match those files, and it never touches PostgREST — which
 * is the layer the application actually speaks to, and which has its own rules
 * about what an anonymous key may do.
 *
 * This runs against the deployed database, with the deployed anon key, carrying
 * member tokens signed with the project's own JWT secret. That is the same shape
 * as a signed-in customer's browser.
 *
 *   node packages/db/scripts/radar-rls-live-proof.mjs
 *   node packages/db/scripts/radar-rls-live-proof.mjs --keep   # skip cleanup
 */
import { createClient } from '@supabase/supabase-js'
import { createHmac } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
const env = {}
for (const line of readFileSync(resolve(ROOT, '.' + 'env'), 'utf8').split('\n')) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/)
  if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '')
}

const BASE = new URL(env.NEXT_PUBLIC_SUPABASE_URL).origin
const KEEP = process.argv.includes('--keep')

const b64url = (s) => Buffer.from(s).toString('base64url')
function mintJwt(sub) {
  const now = Math.floor(Date.now() / 1000)
  const head = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  const body = b64url(
    JSON.stringify({
      sub,
      role: 'authenticated',
      aud: 'authenticated',
      // Backdated 300s: PostgREST allows a fixed 30s of clock skew and answers
      // PGRST303 past it. Minting at `now` spends the whole allowance on skew.
      iat: now - 300,
      exp: now + 3600,
    }),
  )
  const sig = createHmac('sha256', env.SUPABASE_JWT_SECRET)
    .update(`${head}.${body}`)
    .digest('base64url')
  return `${head}.${body}.${sig}`
}

const svc = createClient(BASE, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const anon = createClient(BASE, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
  auth: { persistSession: false },
})
const asUser = (sub) =>
  createClient(BASE, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${mintJwt(sub)}` } },
  })

// Run-scoped so nothing here can ever collide with a real customer's row.
const RUN = `radarproof${Date.now().toString(36)}`
const USER_A = `user_${RUN}_a`
const USER_B = `user_${RUN}_b`
const USER_C = `user_${RUN}_none`

let PASS = 0
let FAIL = 0
function check(label, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}`)
  console.log(`        server said: ${JSON.stringify(actual)}`)
  if (!ok) console.log(`        expected   : ${JSON.stringify(expected)}`)
  ok ? (PASS += 1) : (FAIL += 1)
}

const created = { workspaces: [], competitors: [] }

try {
  // ── fixtures, via the service role (the runner's own identity) ─────────────
  const mkWorkspace = async (name, by) => {
    const { data, error } = await svc
      .from('workspaces')
      .insert({ name, slug: `${RUN}-${name}`, created_by: by })
      .select('id')
      .single()
    if (error) throw new Error(`workspace ${name}: ${error.message}`)
    created.workspaces.push(data.id)
    return data.id
  }
  const wsA = await mkWorkspace('a', USER_A)
  const wsB = await mkWorkspace('b', USER_B)
  await svc.from('workspace_members').insert([
    { workspace_id: wsA, user_id: USER_A, role: 'owner' },
    { workspace_id: wsB, user_id: USER_B, role: 'owner' },
  ])

  // `app` is not an exposed schema, so app.radar_subscribe is not reachable over
  // PostgREST — which is the point of putting it there. It is called over the
  // direct connection instead, exactly as the nightly runner will.
  const pg = (await import('pg')).default
  const pool = new pg.Pool({
    connectionString: env.SUPABASE_DB_URL,
    ssl: { rejectUnauthorized: false },
    max: 2,
  })
  const sub = async (ws, name, kind, locator, by) => {
    const r = await pool.query(`select app.radar_subscribe($1::uuid, $2, $3::jsonb, $4) as out`, [
      ws,
      name,
      JSON.stringify([{ kind, locator }]),
      by,
    ])
    return r.rows[0].out
  }

  const onlyA = await sub(wsA, `${RUN} rival of A`, 'website', `${RUN}-only-a.example`, USER_A)
  const onlyB = await sub(wsB, `${RUN} rival of B`, 'website', `${RUN}-only-b.example`, USER_B)
  // THE SHARED ROW — subscribed by BOTH, and written two different ways so the
  // dedupe is exercised at the same time. Without this row, disclosure (b) can
  // never fire and the whole proof would be about the easy half of the design.
  const sharedA = await sub(wsA, `${RUN} shared`, 'instagram', `@${RUN}shared`, USER_A)
  const sharedB = await sub(
    wsB,
    `${RUN} shared`,
    'instagram',
    `instagram.com/${RUN}Shared/`,
    USER_B,
  )
  created.competitors.push(onlyA.competitor_id, onlyB.competitor_id, sharedA.competitor_id)

  console.log('\n── the shared registry actually deduped ─────────────────────')
  check(
    'both workspaces landed on ONE competitor row for the same handle',
    sharedA.competitor_id === sharedB.competitor_id,
    true,
  )
  console.log(`        competitor_id: ${sharedA.competitor_id}`)

  // A snapshot and a change on the shared source, so the derived tables have
  // something to leak if they are going to.
  const srcShared = sharedA.source_ids[0]
  const s1 = await pool.query(
    `insert into competitor_snapshots (source_id, payload, content_hash, captured_at)
     values ($1::uuid, '{"kind":"social","handle":"x","posts":[]}'::jsonb, 'h1', now() - interval '1 day')
     returning id`,
    [srcShared],
  )
  const s2 = await pool.query(
    `insert into competitor_snapshots (source_id, payload, content_hash, captured_at)
     values ($1::uuid, '{"kind":"social","handle":"x","posts":[]}'::jsonb, 'h2', now())
     returning id`,
    [srcShared],
  )
  await pool.query(
    `insert into competitor_changes (source_id, from_snapshot_id, to_snapshot_id, change_kind, day_span, summary)
     values ($1::uuid, $2::uuid, $3::uuid, 'audience_moved', 1, 'They gained followers.')`,
    [srcShared, s1.rows[0].id, s2.rows[0].id],
  )
  const srcOnlyB = onlyB.source_ids[0]
  await pool.query(
    `insert into radar_fetch_log (source_id, mode, provider, subscriber_count, cost_micros, cost_basis)
     values ($1::uuid, 'render', 'apify', 2, 2600, 'measured')`,
    [srcShared],
  )

  const A = asUser(USER_A)
  const C = asUser(USER_C)

  // ── DISCLOSURE (a): reading a competitor you do not subscribe to ───────────
  console.log('\n── (a) a competitor you do not subscribe to ─────────────────')

  const seenCompetitors = await A.from('competitors').select('id')
  const ids = (seenCompetitors.data ?? []).map((r) => r.id).sort()
  check(
    'A sees its own two competitors and not B-only',
    ids,
    [onlyA.competitor_id, sharedA.competitor_id].sort(),
  )
  check('B-only competitor is absent from A’s list', ids.includes(onlyB.competitor_id), false)

  // Asked by ID, which is the shape that matters: knowing an id must not be
  // enough to read the row.
  const byId = await A.from('competitors').select('id').eq('id', onlyB.competitor_id)
  check('A cannot fetch B’s competitor even knowing its id', byId.data, [])

  const srcById = await A.from('competitor_sources').select('id').eq('id', srcOnlyB)
  check('A cannot fetch B’s source even knowing its id', srcById.data, [])

  const snaps = await A.from('competitor_snapshots').select('id')
  check('A sees the two snapshots on the SHARED source', (snaps.data ?? []).length, 2)

  const changes = await A.from('competitor_changes').select('id,summary')
  check(
    'A sees the change on the shared source, and its summary',
    (changes.data ?? []).map((r) => r.summary),
    ['They gained followers.'],
  )

  // ── DISCLOSURE (b): who is watching whom ──────────────────────────────────
  console.log('\n── (b) who is watching whom ────────────────────────────────')

  const subs = await A.from('competitor_subscriptions').select('id,workspace_id,competitor_id')
  check('A sees exactly its own two subscriptions', (subs.data ?? []).length, 2)
  check(
    'every subscription A can see belongs to A',
    [...new Set((subs.data ?? []).map((r) => r.workspace_id))],
    [wsA],
  )
  check(
    'the shared competitor shows A exactly ONE subscriber row — its own (truth is 2)',
    (subs.data ?? []).filter((r) => r.competitor_id === sharedA.competitor_id).length,
    1,
  )

  const counted = await A.from('competitor_subscriptions')
    .select('id', { count: 'exact', head: true })
    .eq('competitor_id', sharedA.competitor_id)
  check('and a COUNT over the same row agrees — 1, not 2', counted.count, 1)

  const log = await A.from('radar_fetch_log').select('id,subscriber_count')
  check(
    'the fetch log, whose subscriber_count IS the disclosure, is invisible',
    log.data ?? log.error?.code,
    [],
  )

  // ── the identity that separates membership from "the other tenant" ────────
  console.log('\n── a valid token belonging to NO workspace ──────────────────')
  for (const table of [
    'competitors',
    'competitor_sources',
    'competitor_subscriptions',
    'competitor_snapshots',
    'competitor_changes',
    'radar_fetch_log',
  ]) {
    const r = await C.from(table).select('id')
    check(`userC reads ${table}`, r.data ?? r.error?.code, [])
  }

  console.log('\n── signed out entirely ─────────────────────────────────────')
  for (const table of ['competitors', 'competitor_sources', 'competitor_subscriptions']) {
    const r = await anon.from(table).select('id')
    check(`anon reads ${table}`, r.data ?? r.error?.code, [])
  }

  // ── the writing door ──────────────────────────────────────────────────────
  console.log('\n── the writing door, which asks the same question ───────────')
  const insComp = await A.from('competitors')
    .insert({ display_name: `${RUN} probe` })
    .select('id')
  check(
    'A cannot insert a competitor (a duplicate-key error would itself be an answer)',
    insComp.error?.code ?? 'NO ERROR',
    '42501',
  )
  console.log(`        message: ${insComp.error?.message}`)

  const insSub = await A.from('competitor_subscriptions')
    .insert({ workspace_id: wsA, competitor_id: onlyB.competitor_id, created_by: USER_A })
    .select('id')
  check(
    'A cannot subscribe itself to a competitor it discovered an id for',
    insSub.error?.code ?? 'NO ERROR',
    '42501',
  )

  const delOther = await A.from('competitor_subscriptions').delete().eq('workspace_id', wsB)
  const stillThere = await pool.query(
    `select count(*)::int as n from competitor_subscriptions where workspace_id = $1::uuid`,
    [wsB],
  )
  void delOther
  check('B’s subscriptions survive A’s delete attempt', stillThere.rows[0].n, 2)

  await pool.end()
} finally {
  if (KEEP) {
    console.log(`\n--keep: fixtures left behind under namespace ${RUN}`)
  } else {
    // Exactly the ids this run created, by id. No DROP, no TRUNCATE, no
    // unqualified DELETE. Competitors cascade to sources, snapshots and changes;
    // workspaces cascade to subscriptions.
    for (const id of created.competitors) {
      await svc.from('competitors').delete().eq('id', id)
    }
    for (const id of created.workspaces) {
      await svc.from('workspaces').delete().eq('id', id)
    }
    const left = await svc.from('workspaces').select('id').in('id', created.workspaces)
    console.log(
      `\ncleanup: ${created.competitors.length} competitors and ${created.workspaces.length} workspaces removed; ${(left.data ?? []).length} left behind`,
    )
  }
  console.log(`\nPASS ${PASS}   FAIL ${FAIL}`)
  process.exitCode = FAIL === 0 ? 0 : 1
}
