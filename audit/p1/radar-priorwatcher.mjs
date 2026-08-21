#!/usr/bin/env node
/**
 * "Is my rival already being watched by someone else?"
 *
 * app.radar_subscribe's own header names that as the question the whole design
 * exists to refuse, and it refuses it in the obvious place: the return value
 * carries no `created` flag and no competitor `created_at`.
 *
 * But the rows a new subscriber becomes entitled to READ carry timestamps, and
 * the policies grant the whole row. So the question can be asked again from the
 * other side. This measures whether the answer is legible.
 *
 * Run against the fixtures from radar-proof.mjs, with B's subscription stamped
 * as if it were made today and A's history already on the record.
 */
import { withClient, q } from '../lib/db.mjs'
import { mintToken } from '../lib/jwt.mjs'
import { rest } from '../lib/rest.mjs'

const P = 'aaaaaaaa'
const WS_B = `${P}-0000-4000-8000-00000000000b`
const CMP_SHARED = `${P}-0000-4000-8000-0000000000c1`
const SRC_SHARED = `${P}-0000-4000-8000-0000000000f1`
const USER_B = 'audit_radar_user_b'

// Make the timeline unambiguous: A and the competitor are 30 days old, B joined
// one minute ago. This is the ordinary case, not a contrived one — every second
// subscriber to any competitor is in exactly this position.
await withClient(
  async (c) => {
    await c.query(`update competitors set created_at = now() - interval '30 days' where id=$1`, [
      CMP_SHARED,
    ])
    await c.query(
      `update competitor_sources set created_at = now() - interval '30 days',
              last_seen_at = now() - interval '1 day' where id=$1`,
      [SRC_SHARED],
    )
    await c.query(
      `update competitor_subscriptions set created_at = now() - interval '1 minute'
       where workspace_id=$1 and competitor_id=$2`,
      [WS_B, CMP_SHARED],
    )
  },
  { readOnly: false },
)

const B = mintToken({ sub: USER_B, ttlSeconds: 3600 })

const mine = await rest(
  `/competitor_subscriptions?competitor_id=eq.${CMP_SHARED}&select=created_at`,
  { token: B },
)
const comp = await rest(`/competitors?id=eq.${CMP_SHARED}&select=id,display_name,created_at`, {
  token: B,
})
const src = await rest(
  `/competitor_sources?competitor_id=eq.${CMP_SHARED}&select=id,locator,created_at,last_seen_at`,
  { token: B },
)
const snaps = await rest(
  `/competitor_snapshots?source_id=eq.${SRC_SHARED}&select=id,captured_at&order=captured_at.asc`,
  { token: B },
)

console.log("B's own subscription created_at :", mine.json?.[0]?.created_at)
console.log('competitor row B can read       :', JSON.stringify(comp.json?.[0]))
console.log('source row B can read           :', JSON.stringify(src.json?.[0]))
console.log('snapshots B can read            :', JSON.stringify(snaps.json))

const myJoin = new Date(mine.json?.[0]?.created_at).getTime()
const compAge = new Date(comp.json?.[0]?.created_at).getTime()
const oldestSnap = snaps.json?.length ? new Date(snaps.json[0].captured_at).getTime() : null
const lastSeen = src.json?.[0]?.last_seen_at ? new Date(src.json[0].last_seen_at).getTime() : null

console.log('\n=== what B can infer ===')
const tells = [
  [
    'competitors.created_at predates my subscription',
    compAge < myJoin,
    `competitor created ${Math.round((myJoin - compAge) / 86400000)} days before I subscribed`,
  ],
  [
    'competitor_sources.last_seen_at predates my subscription',
    lastSeen !== null && lastSeen < myJoin,
    'the source was already being fetched on somebody’s behalf',
  ],
  [
    'competitor_snapshots exist from before my subscription',
    oldestSnap !== null && oldestSnap < myJoin,
    `oldest snapshot is ${snaps.json?.length ? Math.round((myJoin - oldestSnap) / 86400000) : '-'} days old`,
  ],
]
let leaks = 0
for (const [name, yes, why] of tells) {
  if (yes) leaks++
  console.log(`${yes ? '!! LEGIBLE' : '   opaque '}  ${name.padEnd(56)} ${yes ? why : ''}`)
}
console.log(
  `\n${leaks}/3 tells are readable by a second subscriber.`,
  leaks
    ? '\nB can conclude someone was watching this competitor before B was — which is\nthe exact question radar_subscribe refuses to answer in its return value.'
    : '',
)

// And the reverse direction: does A learn that B has joined?
const USER_A = 'audit_radar_user_a'
const A = mintToken({ sub: USER_A, ttlSeconds: 3600 })
const aSees = await rest(`/competitor_subscriptions?competitor_id=eq.${CMP_SHARED}&select=*`, {
  token: A,
})
const truth = await q(
  `select count(*)::int as n from competitor_subscriptions where competitor_id=$1`,
  [CMP_SHARED],
)
console.log(
  `\nA reading the shared competitor's subscriptions sees ${aSees.json?.length} row(s); the truth is ${truth[0].n}.`,
  '\nSo the identity of the other subscriber stays hidden. It is the TIMELINE that talks.',
)
