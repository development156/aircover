import type { PGlite } from '@electric-sql/pglite'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'

import { bootFullSchema, asMember, probe } from './helpers/pglite-tenant'

/**
 * A subscriber may not add sources to a competitor it did not create.
 *
 * ── WHAT WAS WRONG ──────────────────────────────────────────────────────────
 * `app.radar_subscribe` resolved the competitor from the first source that
 * already existed and then attached EVERY source in the call to it. MEASURED
 * 2026-09-02 before 20260902220004: A subscribed [{website rival.com}]; B then
 * subscribed [{website rival.com}, {instagram bakery_a_owner}, {website
 * other.com}]; B got the same competitor_id and `competitor_sources` for it held
 * all three rows, every one readable by A under RLS and fetched nightly outside
 * B's per-workspace cap (which only engages with exactly one subscriber).
 *
 * ── WHAT THIS PROVES ────────────────────────────────────────────────────────
 * Two workspaces, under RLS. B's two-source join is refused with
 * RADAR_SOURCES_LOCKED, the competitor still has exactly one source, A still
 * reads only rival.com, B holds no subscription and no stray competitor was
 * created for the extra source. And that the guard is NARROW: B joining with the
 * one source that IS the competitor still attaches to the same row (the dedupe
 * the registry exists for), a brand-new competitor still takes several sources in
 * one call, and the door's own refusals (non-member, viewer) still fire first.
 *
 * Mutation that proves the guard: in 20260902220004, delete the
 * `raise exception 'RADAR_SOURCES_LOCKED'` line. The four refusal assertions go
 * red and A reads B's handle.
 */

const WS_A = '11111111-1111-4111-8111-111111111111'
const WS_B = '22222222-2222-4222-8222-222222222222'
const OWNER_A = 'user_lock_owner_a'
const OWNER_B = 'user_lock_owner_b'
const VIEWER_B = 'user_lock_viewer_b'

type Source = { kind: string; locator: string }

/** A member session whose writes SURVIVE; `asMember` rolls back by design. */
async function asMemberCommitting<T>(
  db: PGlite,
  userId: string,
  fn: (tx: PGlite) => Promise<T>,
): Promise<T> {
  await db.exec('begin')
  try {
    await db.query(`select set_config('request.jwt.claims', $1, true)`, [
      JSON.stringify({ sub: userId, role: 'authenticated' }),
    ])
    await db.exec('set local role authenticated')
    const out = await fn(db)
    await db.exec('commit')
    return out
  } catch (error) {
    await db.exec('rollback')
    throw error
  }
}

async function subscribeAs(
  db: PGlite,
  userId: string,
  workspaceId: string,
  name: string,
  sources: Source[],
): Promise<{ ok: true; competitorId: string; sourceIds: string[] } | { ok: false; error: string }> {
  try {
    const out = await asMemberCommitting(db, userId, async (tx) => {
      const r = await tx.query<{ result: { competitor_id: string; source_ids: string[] } }>(
        `select public.radar_subscribe($1::uuid, $2, $3::jsonb, null) as result`,
        [workspaceId, name, JSON.stringify(sources)],
      )
      return r.rows[0]!.result
    })
    return { ok: true, competitorId: out.competitor_id, sourceIds: out.source_ids }
  } catch (error) {
    return { ok: false, error: String((error as Error).message).split('\n')[0]! }
  }
}

describe('app.radar_subscribe: a shared competitor’s sources are locked', () => {
  let db: PGlite
  let rival = ''

  async function sourcesOf(competitorId: string): Promise<Source[]> {
    return (
      await db.query<Source>(
        `select kind, locator from competitor_sources
          where competitor_id = $1 order by created_at, kind, locator`,
        [competitorId],
      )
    ).rows
  }

  beforeAll(async () => {
    db = await bootFullSchema()
    await db.exec(`
      insert into workspaces (id, name, slug, created_by) values
        ('${WS_A}', 'A', 'lock-a', '${OWNER_A}'),
        ('${WS_B}', 'B', 'lock-b', '${OWNER_B}');
      insert into workspace_members (workspace_id, user_id, role) values
        ('${WS_A}', '${OWNER_A}',  'owner'),
        ('${WS_B}', '${OWNER_B}',  'owner'),
        ('${WS_B}', '${VIEWER_B}', 'viewer');
    `)
    const a = await subscribeAs(db, OWNER_A, WS_A, 'Rival', [
      { kind: 'website', locator: 'rival.com' },
    ])
    if (!a.ok) throw new Error(`A's own subscribe should succeed: ${a.error}`)
    rival = a.competitorId
  }, 120_000)

  afterAll(async () => {
    await db?.close()
  })

  it('baseline: A watches one competitor with exactly one source', async () => {
    expect(await sourcesOf(rival)).toEqual([{ kind: 'website', locator: 'rival.com' }])
  })

  it('REFUSES B joining A’s rival with an extra source, and writes nothing', async () => {
    const r = await subscribeAs(db, OWNER_B, WS_B, 'Rival', [
      { kind: 'website', locator: 'https://www.rival.com/' },
      { kind: 'instagram', locator: '@bakery_a_owner' },
    ])
    expect(r.ok).toBe(false)
    expect(r.ok === false && r.error).toContain('RADAR_SOURCES_LOCKED')

    // The competitor is untouched, B has no subscription, and no competitor was
    // minted for the handle on the way to the refusal.
    expect(await sourcesOf(rival)).toEqual([{ kind: 'website', locator: 'rival.com' }])
    const subs = (
      await db.query<{ n: number }>(
        `select count(*)::int as n from competitor_subscriptions where workspace_id = $1`,
        [WS_B],
      )
    ).rows[0]!.n
    expect(subs).toBe(0)
    const handle = (
      await db.query<{ n: number }>(
        `select count(*)::int as n from competitor_sources where locator = 'bakery_a_owner'`,
      )
    ).rows[0]!.n
    expect(handle).toBe(0)
  })

  it('REFUSES the same when the extra source comes FIRST in the array', async () => {
    // The resolver scans for the first EXISTING source; the order of the
    // array must not change the answer.
    const r = await subscribeAs(db, OWNER_B, WS_B, 'Rival', [
      { kind: 'instagram', locator: 'bakery_a_owner' },
      { kind: 'website', locator: 'rival.com' },
    ])
    expect(r.ok).toBe(false)
    expect(r.ok === false && r.error).toContain('RADAR_SOURCES_LOCKED')
    expect(await sourcesOf(rival)).toHaveLength(1)
  })

  it('A still reads only rival.com under RLS after the attempts', async () => {
    const got = await asMember(db, OWNER_A, (tx) =>
      probe<Source>(tx, `select kind, locator from competitor_sources where competitor_id = $1`, [
        rival,
      ]),
    )
    expect('rows' in got ? got.rows : got.denied).toEqual([
      { kind: 'website', locator: 'rival.com' },
    ])
  })

  // ── THE GUARD IS NARROW ───────────────────────────────────────────────────

  it('B joining with the ONE source that is the competitor still shares A’s row', async () => {
    const r = await subscribeAs(db, OWNER_B, WS_B, 'Their Rival', [
      { kind: 'website', locator: 'rival.com' },
    ])
    expect(r.ok).toBe(true)
    expect(r.ok && r.competitorId).toBe(rival)
    expect(r.ok && r.sourceIds).toHaveLength(1)
    expect(await sourcesOf(rival)).toHaveLength(1)
  })

  it('and once subscribed, B STILL cannot extend the shared competitor', async () => {
    // Being a subscriber is not authorship. A's watch list is still A's.
    const r = await subscribeAs(db, OWNER_B, WS_B, 'Their Rival', [
      { kind: 'website', locator: 'rival.com' },
      { kind: 'x', locator: 'rival_official' },
    ])
    expect(r.ok).toBe(false)
    expect(r.ok === false && r.error).toContain('RADAR_SOURCES_LOCKED')
    expect(await sourcesOf(rival)).toHaveLength(1)
  })

  it('a NEW competitor still takes several sources in one call', async () => {
    const r = await subscribeAs(db, OWNER_B, WS_B, 'Fresh', [
      { kind: 'website', locator: 'fresh.example' },
      { kind: 'instagram', locator: '@fresh' },
    ])
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.competitorId).not.toBe(rival)
    expect(r.sourceIds).toHaveLength(2)
    // Both rows share one created_at (one transaction), so the read orders by kind.
    expect(await sourcesOf(r.competitorId)).toEqual([
      { kind: 'instagram', locator: 'fresh' },
      { kind: 'website', locator: 'fresh.example' },
    ])
  })

  it('the door’s own refusals still come first: a viewer is refused before the lock', async () => {
    const r = await subscribeAs(db, VIEWER_B, WS_B, 'Rival', [
      { kind: 'website', locator: 'rival.com' },
      { kind: 'instagram', locator: 'bakery_a_owner' },
    ])
    expect(r.ok).toBe(false)
    expect(r.ok === false && r.error).toContain('FORBIDDEN_ROLE')
  })

  it('a non-member is refused before the lock, whichever workspace they name', async () => {
    const r = await subscribeAs(db, OWNER_B, WS_A, 'Rival', [
      { kind: 'website', locator: 'rival.com' },
      { kind: 'instagram', locator: 'bakery_a_owner' },
    ])
    expect(r.ok).toBe(false)
    expect(r.ok === false && r.error).toContain('NOT_A_MEMBER')
  })
})
