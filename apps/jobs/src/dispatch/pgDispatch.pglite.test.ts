import { PGlite } from '@electric-sql/pglite'
import { describe, it, expect, beforeEach, afterEach } from 'vitest'

import { classifyCandidate } from './classify'
import { PUBLISH_LEASE_SECONDS } from './lease'
import { createDispatchStore, type PgQueryable } from './pgDispatch'

/**
 * The candidate query, EXECUTED against a real Postgres rather than read.
 *
 * `pgDispatch.test.ts` proves the statement is sent and the rows are mapped; it cannot
 * prove the statement runs, and this one grew two lateral joins and a `jsonb ->>` that a
 * fake pool would accept with a typo in them. PGlite is Postgres compiled to WASM, so the
 * two facts the classifier now depends on — the claim's age and whether the latest log
 * row is an unresolved STILL_PROCESSING — are read the way production reads them.
 *
 * The DDL is the columns the statement touches, no more; drift from the real tables is
 * the live suite's job.
 */
const DDL = `
  create table posts (
    id uuid primary key default gen_random_uuid(),
    workspace_id uuid not null,
    status text not null,
    scheduled_at timestamptz
  );
  create table post_variants (
    id uuid primary key default gen_random_uuid(),
    workspace_id uuid not null,
    post_id uuid not null,
    channel text not null,
    publish_status text not null default 'pending',
    publish_claimed_at timestamptz,
    created_at timestamptz not null default now()
  );
  create table post_publish_logs (
    id uuid primary key default gen_random_uuid(),
    workspace_id uuid not null,
    post_id uuid not null,
    variant_id uuid,
    channel text not null,
    status text not null,
    mode text not null default 'live',
    platform_post_id text,
    error jsonb,
    created_at timestamptz not null default now()
  );
`

const WS = '11111111-1111-4111-8111-111111111111'
const PROVIDER_ID = '0123456789abcdef01234567'

function poolOver(db: PGlite): PgQueryable {
  return {
    query: async (text: string, params?: unknown[]) => {
      const r = await db.query(text, params as unknown[])
      return { rows: r.rows, rowCount: r.affectedRows ?? r.rows.length }
    },
  } as unknown as PgQueryable
}

describe('the dispatch candidate query (real Postgres, in-process)', () => {
  let db: PGlite
  let store: ReturnType<typeof createDispatchStore>

  const post = async (minutesLate: number): Promise<string> => {
    const r = await db.query<{ id: string }>(
      `insert into posts (workspace_id, status, scheduled_at)
       values ($1, 'approved', now() - make_interval(mins => $2::int)) returning id`,
      [WS, minutesLate],
    )
    return r.rows[0]!.id
  }

  const variant = async (
    postId: string,
    publishStatus: string,
    claimedAgoSeconds: number | null,
  ): Promise<string> => {
    const r = await db.query<{ id: string }>(
      `insert into post_variants (workspace_id, post_id, channel, publish_status, publish_claimed_at)
       values ($1, $2, 'instagram', $3,
               case when $4::int is null then null else now() - make_interval(secs => $4::int) end)
       returning id`,
      [WS, postId, publishStatus, claimedAgoSeconds],
    )
    return r.rows[0]!.id
  }

  const log = async (
    postId: string,
    variantId: string,
    status: 'succeeded' | 'failed',
    error: Record<string, unknown> | null,
    platformPostId: string | null,
    agoSeconds: number,
  ): Promise<void> => {
    await db.query(
      `insert into post_publish_logs
         (workspace_id, post_id, variant_id, channel, status, platform_post_id, error, created_at)
       values ($1, $2, $3, 'instagram', $4, $5, $6, now() - make_interval(secs => $7::int))`,
      [
        WS,
        postId,
        variantId,
        status,
        platformPostId,
        error ? JSON.stringify(error) : null,
        agoSeconds,
      ],
    )
  }

  const classify = async () => {
    const [candidate] = await store.listCandidates()
    return classifyCandidate(candidate!, {
      now: new Date(),
      graceSeconds: 3600,
      leaseSeconds: PUBLISH_LEASE_SECONDS,
    })
  }

  beforeEach(async () => {
    db = new PGlite()
    await db.exec(DDL)
    store = createDispatchStore({ pool: poolOver(db) })
  })

  afterEach(async () => {
    await db.close()
  })

  it('reads the claim as ISO and a dead one classifies as dispatchable', async () => {
    const postId = await post(10)
    const variantId = await variant(postId, 'publishing', PUBLISH_LEASE_SECONDS + 1)

    const [candidate] = await store.listCandidates()
    expect(candidate!.variants[0]!.claimedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)

    const d = await classify()
    expect(d.kind).toBe('dispatch')
    if (d.kind !== 'dispatch') return
    expect(d.variants.map((v) => v.variantId)).toEqual([variantId])
  })

  it('a claim still inside the lease is held as in-flight', async () => {
    const postId = await post(10)
    await variant(postId, 'publishing', PUBLISH_LEASE_SECONDS - 1)

    const d = await classify()
    expect(d.kind).toBe('hold')
    if (d.kind !== 'hold') return
    expect(d.reason).toBe('in-flight')
  })

  it('an unresolved STILL_PROCESSING log holds the variant instead of re-sending it', async () => {
    const postId = await post(10)
    const variantId = await variant(postId, 'scheduled', null)
    await log(
      postId,
      variantId,
      'failed',
      { code: 'STILL_PROCESSING', classification: 'transient', message: 'still processing' },
      PROVIDER_ID,
      300,
    )

    const [candidate] = await store.listCandidates()
    expect(candidate!.variants[0]!.awaitingPlatform).toBe(true)

    const d = await classify()
    expect(d.kind).toBe('hold')
    if (d.kind !== 'hold') return
    expect(d.reason).toBe('awaiting-platform')
  })

  it('a later log row ends the wait, whatever its status', async () => {
    // The reconcile pass appends a row when it learns how the post ended. Its `failed`
    // row carries a different code; its `succeeded` row carries none.
    const postId = await post(10)
    const variantId = await variant(postId, 'scheduled', null)
    await log(
      postId,
      variantId,
      'failed',
      { code: 'STILL_PROCESSING', classification: 'transient', message: 'still processing' },
      PROVIDER_ID,
      300,
    )
    await log(
      postId,
      variantId,
      'failed',
      { code: 'PLATFORM_REJECTED', classification: 'permanent', message: 'refused' },
      PROVIDER_ID,
      60,
    )

    const [candidate] = await store.listCandidates()
    expect(candidate!.variants[0]!.awaitingPlatform).toBe(false)
  })

  it('the proven mode still comes from the latest SUCCEEDED row, not the latest row', async () => {
    // The two lateral reads must not be collapsed into one: a failed retry after a
    // succeeded log would otherwise erase the mode the classifier promotes on.
    const postId = await post(10)
    const variantId = await variant(postId, 'published', null)
    await log(postId, variantId, 'succeeded', null, 'ig-1', 300)
    await log(
      postId,
      variantId,
      'failed',
      { code: 'RATE_LIMITED', classification: 'transient', message: 'slow down' },
      null,
      60,
    )

    const [candidate] = await store.listCandidates()
    expect(candidate!.variants[0]!.publishedMode).toBe('live')
    expect(candidate!.variants[0]!.awaitingPlatform).toBe(false)
  })
})
