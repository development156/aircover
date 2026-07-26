import { describe, it, expect, vi } from 'vitest'
import { createDispatchStore, type PgQueryable } from './pgDispatch'

interface Call {
  text: string
  params: unknown[]
}

/** Records every statement so the guards can be asserted, and replays canned rows. */
function fakePool(result: { rows?: unknown[]; rowCount?: number } = {}) {
  const calls: Call[] = []
  const pool: PgQueryable = {
    query: vi.fn(async (text: string, params?: unknown[]) => {
      calls.push({ text, params: params ?? [] })
      return { rows: result.rows ?? [], rowCount: result.rowCount ?? 0 }
    }),
  } as unknown as PgQueryable
  return { pool, calls }
}

const squash = (s: string) => s.replace(/\s+/g, ' ').toLowerCase()

const row = (over: Record<string, unknown> = {}) => ({
  post_id: 'p1',
  workspace_id: 'ws-1',
  status: 'approved',
  scheduled_at: '2026-07-25T09:00:00.000Z',
  variant_id: 'v1',
  channel: 'x',
  publish_status: 'pending',
  published_mode: null,
  ...over,
})

describe('createDispatchStore — listCandidates', () => {
  it('groups the variant rows of one post into a single candidate', async () => {
    const { pool } = fakePool({
      rows: [
        row({ variant_id: 'v1', channel: 'x' }),
        row({
          variant_id: 'v2',
          channel: 'gbp',
          publish_status: 'published',
          published_mode: 'live',
        }),
      ],
    })

    const candidates = await createDispatchStore({ pool }).listCandidates()

    expect(candidates).toHaveLength(1)
    expect(candidates[0]!.postId).toBe('p1')
    expect(candidates[0]!.variants).toEqual([
      { variantId: 'v1', channel: 'x', publishStatus: 'pending', publishedMode: null },
      { variantId: 'v2', channel: 'gbp', publishStatus: 'published', publishedMode: 'live' },
    ])
  })

  it('keeps separate posts separate', async () => {
    const { pool } = fakePool({
      rows: [row({ post_id: 'p1' }), row({ post_id: 'p2', variant_id: 'v9' })],
    })

    const candidates = await createDispatchStore({ pool }).listCandidates()

    expect(candidates.map((c) => c.postId)).toEqual(['p1', 'p2'])
  })

  it('yields a candidate with no variants when the post has none', async () => {
    // The LEFT JOIN produces one row with a null variant. That post is real and must still
    // be classified — past its grace it is exactly what `expire` is for.
    const { pool } = fakePool({
      rows: [row({ variant_id: null, channel: null, publish_status: null })],
    })

    const candidates = await createDispatchStore({ pool }).listCandidates()

    expect(candidates).toHaveLength(1)
    expect(candidates[0]!.variants).toEqual([])
  })

  it('normalises scheduled_at to an ISO string whatever pg hands back', async () => {
    // node-postgres returns timestamptz as a Date. The idempotency key is built from this
    // value as a string, so it has to be one shape, always.
    const { pool } = fakePool({ rows: [row({ scheduled_at: new Date('2026-07-25T09:00:00Z') })] })

    const candidates = await createDispatchStore({ pool }).listCandidates()

    expect(candidates[0]!.scheduledAt).toBe('2026-07-25T09:00:00.000Z')
  })

  it('asks only for posts inside the gate whose time has come', async () => {
    const { pool, calls } = fakePool()

    await createDispatchStore({ pool }).listCandidates()

    const sql = squash(calls[0]!.text)
    expect(sql).toContain('scheduled_at is not null')
    expect(sql).toContain('scheduled_at <= now()')
    // The status list is passed as a parameter built from the shared constant, never typed
    // out in the SQL, so the gate cannot drift from @sahoda/shared.
    expect(calls[0]!.params[0]).toEqual(['approved', 'scheduled'])
  })

  it('reads the publish mode from the latest succeeded log only', async () => {
    const { pool, calls } = fakePool()

    await createDispatchStore({ pool }).listCandidates()

    const sql = squash(calls[0]!.text)
    expect(sql).toContain("status = 'succeeded'")
    expect(sql).toContain('post_publish_logs')
  })

  it('bounds the batch so a backlog drains across runs', async () => {
    const { pool, calls } = fakePool()

    await createDispatchStore({ pool, limit: 25 }).listCandidates()

    expect(calls[0]!.params).toContain(25)
  })
})

describe('createDispatchStore — expirePost', () => {
  /**
   * Ruling 1, the standing half. This guard is not an optimisation and not a duplicate of
   * the classifier's check: it is what makes expiry safe when a variant publishes between
   * the sweep's read and its write. It must never be removed.
   */
  it('refuses to expire a post that has a published variant, in the statement itself', async () => {
    const { pool, calls } = fakePool({ rowCount: 1 })

    await createDispatchStore({ pool }).expirePost('p1', 'ws-1')

    const sql = squash(calls[0]!.text)
    expect(sql).toContain('not exists')
    expect(sql).toContain("publish_status = 'published'")
  })

  it('only expires a post still sitting inside the gate', async () => {
    // If something moved it to `published` while we were classifying, we must not stomp it.
    const { pool, calls } = fakePool({ rowCount: 1 })

    await createDispatchStore({ pool }).expirePost('p1', 'ws-1')

    expect(calls[0]!.params).toContainEqual(['approved', 'scheduled'])
  })

  it('reports whether a row actually changed', async () => {
    const changed = fakePool({ rowCount: 1 })
    const guarded = fakePool({ rowCount: 0 })

    expect(await createDispatchStore({ pool: changed.pool }).expirePost('p1', 'ws-1')).toBe(true)
    expect(await createDispatchStore({ pool: guarded.pool }).expirePost('p1', 'ws-1')).toBe(false)
  })

  it('never writes updated_at by hand', async () => {
    // A set_updated_at trigger owns that column on posts.
    const { pool, calls } = fakePool({ rowCount: 1 })

    await createDispatchStore({ pool }).expirePost('p1', 'ws-1')

    expect(squash(calls[0]!.text)).not.toContain('updated_at')
  })
})

describe('createDispatchStore — settlePost', () => {
  it('writes the fanned-in status, guarded on the post still being in the gate', async () => {
    const { pool, calls } = fakePool({ rowCount: 1 })

    const ok = await createDispatchStore({ pool }).settlePost('p1', 'ws-1', 'published')

    expect(ok).toBe(true)
    expect(calls[0]!.params).toContain('published')
    expect(calls[0]!.params).toContainEqual(['approved', 'scheduled'])
  })

  it('reports a guarded settle as no change', async () => {
    const { pool } = fakePool({ rowCount: 0 })

    expect(await createDispatchStore({ pool }).settlePost('p1', 'ws-1', 'failed')).toBe(false)
  })
})
