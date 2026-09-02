import { PGlite } from '@electric-sql/pglite'
import type { Pool } from 'pg'
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import type { PublishPostPayload } from '@sahoda/shared'

import { createPublishStore } from './store'
import { PUBLISH_LEASE_SECONDS } from './runClaimedPublish'

/**
 * The publish lease, executed against a real Postgres.
 *
 * ── WHY THIS RUNS ON PGlite AND NOT ON A FAKE ────────────────────────────────
 * The whole guarantee is ONE SQL predicate (`store.ts` `claimVariant`): a claim is
 * available when nobody holds one, or when the one held is older than the lease. A
 * fake `pool` can only assert that we SENT that string — `LEARNINGS.md`'s own rule
 * is that a call is not an outcome, and a test that pins the text would stay green
 * against a predicate Postgres evaluates differently than we read it.
 *
 * The live suites cannot answer this: `tests/helpers/forbidden-target.ts` refuses
 * the one Supabase project outright, and there is no branch database here. PGlite is
 * Postgres itself compiled to WASM, in-process — real `now()`, real `make_interval`,
 * real single-statement atomicity — so the predicate is EXECUTED rather than
 * inspected.
 *
 * What it does NOT prove: the real `post_variants` DDL. The table below is the
 * columns this statement touches and nothing else, so a schema drift is still the
 * live suite's job to catch.
 */

/** The four columns `claimVariant`, `releaseVariant` and `markVariant` read or write. */
const DDL = `
  create table post_variants (
    id uuid primary key default gen_random_uuid(),
    post_id uuid not null,
    workspace_id uuid not null,
    publish_status text not null default 'pending',
    publish_claimed_at timestamptz,
    platform_post_id text,
    permalink text,
    last_error jsonb
  )
`

const WS = '11111111-1111-4111-8111-111111111111'
const POST = '22222222-2222-4222-8222-222222222222'

/**
 * The slice of `pg.Pool` the store actually uses, over PGlite.
 *
 * `rowCount` is the load-bearing one: `claimVariant` returns `rowCount > 0`, and
 * PGlite reports affected rows under a different name. Mapping it wrong would make
 * every claim look successful, so it is mapped explicitly rather than spread.
 */
function poolOver(db: PGlite): Pool {
  return {
    query: async (text: string, params?: unknown[]) => {
      const r = await db.query(text, params as unknown[])
      return { rows: r.rows, rowCount: r.affectedRows ?? r.rows.length }
    },
  } as unknown as Pool
}

describe('the publish lease (real Postgres, in-process)', () => {
  let db: PGlite
  let store: ReturnType<typeof createPublishStore>
  let variantId: string

  const payload = (): PublishPostPayload => ({
    workspaceId: WS,
    postId: POST,
    variantId,
    channel: 'instagram',
    scheduledAt: '2026-08-08T10:00:00.000Z',
  })

  /** Age the claim by hand — the alternative is sleeping for ten real minutes. */
  const ageClaimBy = async (seconds: number): Promise<void> => {
    await db.query(
      `update post_variants set publish_claimed_at = now() - make_interval(secs => $2::int) where id = $1`,
      [variantId, seconds],
    )
  }

  const readRow = async (): Promise<{
    publish_status: string
    publish_claimed_at: string | null
  }> => {
    const r = await db.query<{ publish_status: string; publish_claimed_at: string | null }>(
      'select publish_status, publish_claimed_at from post_variants where id = $1',
      [variantId],
    )
    return r.rows[0]!
  }

  beforeEach(async () => {
    db = new PGlite()
    await db.exec(DDL)
    store = createPublishStore({ pool: poolOver(db) })
    const r = await db.query<{ id: string }>(
      `insert into post_variants (post_id, workspace_id, publish_status)
       values ($1, $2, 'scheduled') returning id`,
      [POST, WS],
    )
    variantId = r.rows[0]!.id
  })

  afterEach(async () => {
    await db.close()
  })

  it('is ten minutes, and that is the number runClaimedPublish uses', () => {
    expect(PUBLISH_LEASE_SECONDS).toBe(600)
  })

  it('claims a variant nobody holds', async () => {
    expect(await store.claimVariant(payload(), PUBLISH_LEASE_SECONDS)).toBe(true)

    const row = await readRow()
    expect(row.publish_status).toBe('publishing')
    expect(row.publish_claimed_at).not.toBeNull()
  })

  it('refuses a second claimant while the lease is live', async () => {
    await store.claimVariant(payload(), PUBLISH_LEASE_SECONDS)

    // The overlapping cron tick. Exactly one of the two owns the variant.
    expect(await store.claimVariant(payload(), PUBLISH_LEASE_SECONDS)).toBe(false)
  })

  it('a claim older than the lease is taken over', async () => {
    await store.claimVariant(payload(), PUBLISH_LEASE_SECONDS)
    // The holder was killed mid-publish and released nothing. Ten minutes pass.
    await ageClaimBy(PUBLISH_LEASE_SECONDS + 1)

    expect(await store.claimVariant(payload(), PUBLISH_LEASE_SECONDS)).toBe(true)

    const row = await readRow()
    expect(row.publish_status).toBe('publishing')
  })

  it('holds the row for the last second of the lease', async () => {
    await store.claimVariant(payload(), PUBLISH_LEASE_SECONDS)
    await ageClaimBy(PUBLISH_LEASE_SECONDS - 1)

    // A publish still inside its lease must never have its row stolen mid-flight.
    expect(await store.claimVariant(payload(), PUBLISH_LEASE_SECONDS)).toBe(false)
  })

  it('never re-claims a published variant, however stale its claim looks', async () => {
    await db.query(
      `update post_variants set publish_status = 'published', publish_claimed_at = now() - make_interval(secs => $2::int) where id = $1`,
      [variantId, PUBLISH_LEASE_SECONDS * 100],
    )

    // The duplicate-post guarantee: an expired lease is not a licence to post again.
    expect(await store.claimVariant(payload(), PUBLISH_LEASE_SECONDS)).toBe(false)
  })

  it('a variant published for real stays unclaimable whatever its permalink looks like', async () => {
    // The sibling shape of the test above: a real permalink, not a null one. The
    // fixture exception below must key on the `fixture://` prefix and nothing wider.
    await db.query(
      `update post_variants
          set publish_status = 'published',
              permalink = 'https://instagram.com/p/1',
              publish_claimed_at = now() - make_interval(secs => $2::int)
        where id = $1`,
      [variantId, PUBLISH_LEASE_SECONDS * 100],
    )

    expect(await store.claimVariant(payload(), PUBLISH_LEASE_SECONDS)).toBe(false)
  })

  it('a variant whose only "publish" was the fixture rail is claimable again', async () => {
    // MEASURED before this clause: three X variants sat `published` with a
    // `fixture://` permalink, and no button, cron or RPC could ever publish them for
    // real. Nothing left the building, so claiming it again cannot post twice.
    await db.query(
      `update post_variants
          set publish_status = 'published', permalink = 'fixture://instagram/abc'
        where id = $1`,
      [variantId],
    )

    expect(await store.claimVariant(payload(), PUBLISH_LEASE_SECONDS)).toBe(true)
    expect(await readRow()).toMatchObject({ publish_status: 'publishing' })
  })

  it('hands the row back to scheduled when the publisher releases it', async () => {
    await store.claimVariant(payload(), PUBLISH_LEASE_SECONDS)

    await store.releaseVariant(payload())

    expect(await readRow()).toMatchObject({ publish_status: 'scheduled', publish_claimed_at: null })
  })

  it('a release cannot undo a terminal outcome', async () => {
    await store.claimVariant(payload(), PUBLISH_LEASE_SECONDS)
    await store.markVariant({
      workspaceId: WS,
      variantId,
      publishStatus: 'published',
      platformPostId: 'ig-1',
      permalink: 'https://instagram.com/p/1',
      lastError: null,
    })

    await store.releaseVariant(payload())

    // Still published — a late release must not turn a posted variant back into work.
    expect(await readRow()).toMatchObject({ publish_status: 'published', publish_claimed_at: null })
  })
})
