import { beforeEach, describe, expect, test, vi } from 'vitest'

/**
 * `listPublishModes` — the read that decides whether a chip may say "it happened".
 *
 * `mode` ('live' | 'fixture') is not on `post_variants`. It lives on
 * `post_publish_logs`, so proving a publish was real costs an EXTRA read, and
 * that read can fail, time out, or come back empty against a database that has
 * simply never recorded a log.
 *
 * The whole point of these tests is the failure direction. A missing log is not
 * evidence of a live publish. Every unhappy path must degrade to "unknown" so
 * `certaintyFor` renders the weaker claim — never `.is-real`. Silently returning
 * a partial or optimistic answer here would put a solid "Published" chip on a
 * post nothing ever published.
 */

const WORKSPACE = '22222222-2222-4222-8222-222222222222'
const POST_A = 'aaaaaaaa-1111-4111-8111-111111111111'
const POST_B = 'bbbbbbbb-2222-4222-8222-222222222222'

type Filter = { column: string; value: unknown }

const state = vi.hoisted(() => ({
  queries: [] as { table: string; filters: Filter[] }[],
  workspace: null as { id: string } | null,
  rows: null as unknown,
  error: null as { code: string; message: string } | null,
  /** When set, the query rejects instead of resolving — a timeout or a throw. */
  throws: null as Error | null,
}))

vi.mock('server-only', () => ({}))

vi.mock('@/lib/workspaces', () => ({
  getActiveWorkspace: () => Promise.resolve(state.workspace),
}))

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabase: () => ({
    from(table: string) {
      const record = { table, filters: [] as Filter[] }
      state.queries.push(record)
      const result = () => {
        if (state.throws) return Promise.reject(state.throws)
        return Promise.resolve({ data: state.error ? null : state.rows, error: state.error })
      }
      const builder = {
        select: () => builder,
        order: () => builder,
        limit: () => result(),
        in: (column: string, value: unknown) => {
          record.filters.push({ column, value })
          return builder
        },
        eq: (column: string, value: unknown) => {
          record.filters.push({ column, value })
          return builder
        },
        then: (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
          result().then(resolve, reject),
      }
      return builder
    },
  }),
}))

const { listPublishModes } = await import('./read')

const log = (postId: string, mode: 'live' | 'fixture', status = 'succeeded') => ({
  post_id: postId,
  mode,
  status,
})

beforeEach(() => {
  state.queries = []
  state.workspace = { id: WORKSPACE }
  state.rows = []
  state.error = null
  state.throws = null
})

describe('listPublishModes fails safe', () => {
  test('a PostgREST error yields UNKNOWN for every post, not an empty-but-confident answer', async () => {
    state.error = { code: 'PGRST301', message: 'JWT expired' }

    const modes = await listPublishModes([POST_A, POST_B])

    // Every post must resolve to null (unknown) rather than being absent in a
    // way a caller could misread, and certainly not to 'live'.
    expect(modes.get(POST_A) ?? null).toBeNull()
    expect(modes.get(POST_B) ?? null).toBeNull()
  })

  test('a thrown/timed-out read yields UNKNOWN rather than propagating', async () => {
    state.throws = new Error('fetch failed: ETIMEDOUT')

    await expect(listPublishModes([POST_A])).resolves.toBeInstanceOf(Map)
    state.throws = new Error('fetch failed: ETIMEDOUT')
    expect((await listPublishModes([POST_A])).get(POST_A) ?? null).toBeNull()
  })

  test('no log rows at all yields UNKNOWN — absence is not evidence', async () => {
    state.rows = []

    expect((await listPublishModes([POST_A])).get(POST_A) ?? null).toBeNull()
  })

  test('no active workspace yields UNKNOWN and reads nothing', async () => {
    state.workspace = null

    expect((await listPublishModes([POST_A])).get(POST_A) ?? null).toBeNull()
    expect(state.queries).toHaveLength(0)
  })

  test('an empty post list reads nothing at all', async () => {
    expect((await listPublishModes([])).size).toBe(0)
    expect(state.queries).toHaveLength(0)
  })

  test('a malformed row is dropped rather than trusted', async () => {
    // One good row, one row whose mode is not in the enum. The bad row must not
    // become a 'live' answer by coercion, and must not take the good one down.
    state.rows = [log(POST_A, 'live'), { post_id: POST_B, mode: 'REAL', status: 'succeeded' }]

    const modes = await listPublishModes([POST_A, POST_B])

    expect(modes.get(POST_A)).toBe('live')
    expect(modes.get(POST_B) ?? null).toBeNull()
  })
})

describe('listPublishModes is scoped and selective', () => {
  test('filters by workspace AND by the requested posts', async () => {
    await listPublishModes([POST_A, POST_B])

    expect(state.queries).toHaveLength(1)
    expect(state.queries[0]?.table).toBe('post_publish_logs')
    const filters = state.queries[0]?.filters ?? []
    expect(filters.some((f) => f.column === 'workspace_id' && f.value === WORKSPACE)).toBe(true)
    expect(filters.some((f) => f.column === 'post_id')).toBe(true)
  })

  test('only SUCCEEDED logs count toward realness', async () => {
    // A failed attempt against the live adapter is not a publish. If it counted,
    // a post that tried and failed would render as solid "it happened".
    state.rows = [log(POST_A, 'live', 'failed')]

    expect((await listPublishModes([POST_A])).get(POST_A) ?? null).toBeNull()
  })

  test('live + fixture on the same post collapses to mixed, never to live', async () => {
    state.rows = [log(POST_A, 'live'), log(POST_A, 'fixture')]

    expect((await listPublishModes([POST_A])).get(POST_A)).toBe('mixed')
  })

  test('fixture-only collapses to fixture', async () => {
    state.rows = [log(POST_A, 'fixture'), log(POST_A, 'fixture')]

    expect((await listPublishModes([POST_A])).get(POST_A)).toBe('fixture')
  })

  test('live-only collapses to live — the one path that earns .is-real', async () => {
    state.rows = [log(POST_A, 'live'), log(POST_A, 'live')]

    expect((await listPublishModes([POST_A])).get(POST_A)).toBe('live')
  })

  test('one post going live does not make another post look live', async () => {
    state.rows = [log(POST_A, 'live')]

    const modes = await listPublishModes([POST_A, POST_B])

    expect(modes.get(POST_A)).toBe('live')
    expect(modes.get(POST_B) ?? null).toBeNull()
  })
})
