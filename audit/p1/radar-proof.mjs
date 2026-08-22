#!/usr/bin/env node
/**
 * RADAR — the highest-risk surface, proven LIVE.
 *
 * Production holds ZERO competitor subscriptions, so every Radar policy is
 * "present, never exercised": a sweep against real data can only report that
 * nobody saw anything, which is true whether the policy is perfect or absent.
 * The socially explosive case — a bakery discovering its rival tracks it — is
 * therefore unobservable without fixtures, so this builds the minimum that
 * makes it observable and removes it again.
 *
 * The decisive assertion is a COUNT: two workspaces subscribe to ONE shared
 * competitor, and each must be told the subscriber count is 1 when the truth
 * is 2. A row-level check alone would miss an aggregate that leaks the number.
 *
 * The fixtures get NO ledger entries, so cleanup is a plain cascade and the
 * money invariants are untouched.
 *
 *   --setup   create fixtures
 *   --prove   run the probes
 *   --clean   remove fixtures (safe to run repeatedly)
 */
import { withClient, q, countPrivileged } from '../lib/db.mjs'
import { mintToken } from '../lib/jwt.mjs'
import { rest, restCount } from '../lib/rest.mjs'

const P = 'aaaaaaaa'
const WS_A = `${P}-0000-4000-8000-00000000000a`
const WS_B = `${P}-0000-4000-8000-00000000000b`
const CMP_SHARED = `${P}-0000-4000-8000-0000000000c1`
const CMP_A_ONLY = `${P}-0000-4000-8000-0000000000c2`
const SRC_SHARED = `${P}-0000-4000-8000-0000000000f1`
const SRC_A_ONLY = `${P}-0000-4000-8000-0000000000f2`
const SNAP1 = `${P}-0000-4000-8000-0000000000d1`
const SNAP2 = `${P}-0000-4000-8000-0000000000d2`
const SNAP3 = `${P}-0000-4000-8000-0000000000d3`
const SNAP4 = `${P}-0000-4000-8000-0000000000d4`
const CHG1 = `${P}-0000-4000-8000-0000000000e1`
const CHG2 = `${P}-0000-4000-8000-0000000000e2`
const USER_A = 'audit_radar_user_a'
const USER_B = 'audit_radar_user_b'
const mode = process.argv[2] ?? '--prove'

async function clean() {
  await withClient(
    async (c) => {
      // Every child cascades from these two roots. Explicit ids only.
      await c.query(`delete from competitors where id = any($1::uuid[])`, [
        [CMP_SHARED, CMP_A_ONLY],
      ])
      await c.query(`delete from workspaces where id = any($1::uuid[])`, [[WS_A, WS_B]])
    },
    { readOnly: false },
  )
  const left = await q(
    `select
       (select count(*)::int from workspaces where id = any($1::uuid[])) as ws,
       (select count(*)::int from competitors where id = any($2::uuid[])) as cmp,
       (select count(*)::int from competitor_subscriptions where workspace_id = any($1::uuid[])) as subs,
       (select count(*)::int from competitor_sources where competitor_id = any($2::uuid[])) as src`,
    [
      [WS_A, WS_B],
      [CMP_SHARED, CMP_A_ONLY],
    ],
  )
  console.log('cleanup leftovers (all must be 0):', JSON.stringify(left[0]))
  return left[0]
}

async function setup() {
  await clean()
  await withClient(
    async (c) => {
      const norm = async (kind, loc) =>
        (await c.query(`select app.radar_normalize_locator($1,$2) as l`, [kind, loc])).rows[0].l

      await c.query(
        `insert into workspaces (id,name,slug,created_by) values
           ($1,'AUDIT Radar A','audit-radar-a','audit'),
           ($2,'AUDIT Radar B','audit-radar-b','audit')`,
        [WS_A, WS_B],
      )
      await c.query(
        `insert into workspace_members (workspace_id,user_id,role) values
           ($1,$3,'owner'), ($2,$4,'owner')`,
        [WS_A, WS_B, USER_A, USER_B],
      )
      await c.query(
        `insert into competitors (id,display_name) values
           ($1,'AUDIT Shared Rival'), ($2,'AUDIT A-only Rival')`,
        [CMP_SHARED, CMP_A_ONLY],
      )
      const l1 = await norm('website', 'https://audit-shared-rival.example')
      const l2 = await norm('website', 'https://audit-a-only-rival.example')
      await c.query(
        `insert into competitor_sources (id,competitor_id,kind,locator,cadence) values
           ($1,$3,'website',$5,'daily'), ($2,$4,'website',$6,'daily')`,
        [SRC_SHARED, SRC_A_ONLY, CMP_SHARED, CMP_A_ONLY, l1, l2],
      )
      await c.query(
        // captured_on is GENERATED from captured_at — never write it.
        `insert into competitor_snapshots (id,source_id,payload,content_hash,captured_at) values
           ($1,$5,'{"t":"shared v1"}','h1', now() - interval '2 day'),
           ($2,$5,'{"t":"shared v2"}','h2', now()),
           ($3,$6,'{"t":"aonly v1"}','h3', now() - interval '2 day'),
           ($4,$6,'{"t":"aonly v2"}','h4', now())`,
        [SNAP1, SNAP2, SNAP3, SNAP4, SRC_SHARED, SRC_A_ONLY],
      )
      await c.query(
        `insert into competitor_changes (id,source_id,from_snapshot_id,to_snapshot_id,change_kind,day_span,summary) values
           ($1,$3,$5,$6,'page_content',2,'AUDIT shared rival changed its page'),
           ($2,$4,$7,$8,'page_content',2,'AUDIT a-only rival changed its page')`,
        [CHG1, CHG2, SRC_SHARED, SRC_A_ONLY, SNAP1, SNAP2, SNAP3, SNAP4],
      )
      // The whole point: ONE competitor, TWO subscribers, different tenants.
      await c.query(
        `insert into competitor_subscriptions (workspace_id,competitor_id,label,created_by) values
           ($1,$3,'A watches the shared rival','audit'),
           ($2,$3,'B watches the shared rival too','audit'),
           ($1,$4,'A watches its own rival','audit')`,
        [WS_A, WS_B, CMP_SHARED, CMP_A_ONLY],
      )
    },
    { readOnly: false },
  )
  console.log('fixtures created.')
  console.log(
    'ground truth (privileged): subscribers of the shared competitor =',
    await countPrivileged('competitor_subscriptions', 'competitor_id = $1', [CMP_SHARED]),
  )
}

async function prove() {
  const A = mintToken({ sub: USER_A, ttlSeconds: 3600 })
  const B = mintToken({ sub: USER_B, ttlSeconds: 3600 })
  const truthShared = await countPrivileged('competitor_subscriptions', 'competitor_id = $1', [
    CMP_SHARED,
  ])
  const truthAOnly = await countPrivileged('competitor_subscriptions', 'competitor_id = $1', [
    CMP_A_ONLY,
  ])
  console.log(
    `GROUND TRUTH: shared competitor has ${truthShared} subscribers; A-only has ${truthAOnly}\n`,
  )

  const out = []
  const check = (name, got, want, extra = '') => {
    const ok = JSON.stringify(got) === JSON.stringify(want)
    out.push({ name, got, want, ok })
    console.log(
      `${ok ? 'PASS' : '!! FAIL'}  ${name.padEnd(66)} got=${JSON.stringify(got)} want=${JSON.stringify(want)} ${extra}`,
    )
  }

  // ── the decisive one: the subscriber COUNT of a competitor both tenants watch
  for (const [who, tok] of [
    ['A', A],
    ['B', B],
  ]) {
    const r = await restCount(`/competitor_subscriptions?competitor_id=eq.${CMP_SHARED}`, {
      token: tok,
    })
    check(
      `${who}: count of subscribers to the SHARED competitor`,
      r.count,
      1,
      `(truth is ${truthShared} — answering ${truthShared} would tell ${who} it is being watched)`,
    )
  }
  {
    const r = await restCount(`/competitor_subscriptions?competitor_id=eq.${CMP_SHARED}`)
    check('anon: count of subscribers to the SHARED competitor', r.count, 0)
  }

  // ── the same leak through an EMBEDDED aggregate, which a row check misses
  for (const [who, tok] of [
    ['A', A],
    ['B', B],
  ]) {
    const r = await rest(
      `/competitors?id=eq.${CMP_SHARED}&select=id,competitor_subscriptions(count)`,
      { token: tok },
    )
    const n = r.json?.[0]?.competitor_subscriptions?.[0]?.count ?? null
    check(
      `${who}: EMBEDDED subscriber count on the shared competitor`,
      n,
      1,
      `raw=${r.text.slice(0, 120)}`,
    )
  }

  // ── can B see A's private competitor at all, by any route?
  const bRoutes = [
    [`competitors (A-only)`, `/competitors?id=eq.${CMP_A_ONLY}`],
    [`competitor_sources (A-only)`, `/competitor_sources?competitor_id=eq.${CMP_A_ONLY}`],
    [`competitor_snapshots (A-only)`, `/competitor_snapshots?source_id=eq.${SRC_A_ONLY}`],
    [`competitor_changes (A-only)`, `/competitor_changes?source_id=eq.${SRC_A_ONLY}`],
    [`competitor_subscriptions (A's rows)`, `/competitor_subscriptions?workspace_id=eq.${WS_A}`],
  ]
  for (const [label, p] of bRoutes) {
    check(`B: ${label}`, (await restCount(p, { token: B })).count, 0)
    check(`anon: ${label}`, (await restCount(p)).count, 0)
  }

  // ── and does A actually see what it is entitled to? (the vacuous-pass guard)
  check(
    'A: sees BOTH competitors it subscribes to',
    (await restCount('/competitors', { token: A })).count,
    2,
  )
  check(
    'B: sees ONLY the shared competitor',
    (await restCount('/competitors', { token: B })).count,
    1,
  )
  check(
    'A: sees changes for both its sources',
    (await restCount('/competitor_changes', { token: A })).count,
    2,
  )
  check(
    'B: sees changes for the shared source only',
    (await restCount('/competitor_changes', { token: B })).count,
    1,
  )
  check(
    'A: sees its own 2 subscriptions and no more',
    (await restCount('/competitor_subscriptions', { token: A })).count,
    2,
  )
  check(
    'B: sees its own 1 subscription and no more',
    (await restCount('/competitor_subscriptions', { token: B })).count,
    1,
  )

  // ── writes: B tries to reach into A's subscriptions, each way separately
  const subsA0 = await countPrivileged('competitor_subscriptions', 'workspace_id = $1', [WS_A])
  let r = await rest('/competitor_subscriptions', {
    token: B,
    method: 'POST',
    body: { workspace_id: WS_A, competitor_id: CMP_SHARED, created_by: 'audit-attack' },
  })
  check(
    "B: INSERT a subscription into A's workspace",
    await countPrivileged('competitor_subscriptions', 'workspace_id = $1', [WS_A]),
    subsA0,
    `status=${r.status} ${r.text.slice(0, 90)}`,
  )
  r = await rest(`/competitor_subscriptions?workspace_id=eq.${WS_A}`, {
    token: B,
    method: 'PATCH',
    body: { label: 'owned by B' },
  })
  check(
    "B: UPDATE A's subscription labels",
    await countPrivileged(
      'competitor_subscriptions',
      "workspace_id = $1 and label = 'owned by B'",
      [WS_A],
    ),
    0,
    `status=${r.status}`,
  )
  r = await rest(`/competitor_subscriptions?workspace_id=eq.${WS_A}`, {
    token: B,
    method: 'DELETE',
  })
  check(
    "B: DELETE A's subscriptions",
    await countPrivileged('competitor_subscriptions', 'workspace_id = $1', [WS_A]),
    subsA0,
    `status=${r.status}`,
  )
  // and the shared competitor row itself
  r = await rest(`/competitors?id=eq.${CMP_SHARED}`, { token: B, method: 'DELETE' })
  check(
    'B: DELETE the shared competitor row (would erase A’s tracking too)',
    await countPrivileged('competitors', 'id = $1', [CMP_SHARED]),
    1,
    `status=${r.status}`,
  )

  const failed = out.filter((o) => !o.ok)
  console.log(`\n=== ${out.length} assertions · ${failed.length} FAILED ===`)
  for (const f of failed) console.log('  !!', f.name, 'got', f.got, 'want', f.want)
  return failed.length
}

if (mode === '--setup') await setup()
else if (mode === '--clean') await clean()
else if (mode === '--all') {
  await setup()
  const failed = await prove()
  await clean()
  process.exit(failed ? 1 : 0)
} else await prove()
