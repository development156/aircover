import { beforeEach, describe, expect, test, vi } from 'vitest'

/**
 * Home's other two reads: the publish-log summary and the post counts.
 *
 * Both share the spend read's contract, for the same reason. Each is capped,
 * each truncates OLDEST-first, and each must therefore be able to say what it
 * actually covers rather than let a partial answer read as a complete one.
 *
 * And each distinguishes EMPTY from UNREADABLE. "You have published nothing" and
 * "we could not read your publish history" are different claims and only one of
 * them is ever true — a new workspace genuinely has no logs, and rendering a
 * failed read as a confident zero is the same lie in a different column.
 */

const WORKSPACE = '22222222-2222-4222-8222-222222222222'
const NOW = new Date('2026-07-27T09:00:00.000Z')

type Filter = { column: string; value: unknown }

const state = vi.hoisted(() => ({
  queries: [] as { table: string; filters: Filter[]; limit: number | null }[],
  workspace: null as { id: string } | null,
  rows: null as unknown,
  error: null as { code: string; message: string } | null,
  throws: null as Error | null,
}))

vi.mock('server-only', () => ({}))
vi.mock('@/lib/workspaces', () => ({
  getActiveWorkspace: () => Promise.resolve(state.workspace),
  activeWorkspaceRead: async () => {
    // Derived from the SAME value the two-way mock returned, so every
    // assertion below still means what it meant. `null` here is the
    // no-workspace arm; the unreadable arm is exercised by its own test.
    const w = await Promise.resolve(state.workspace)
    return w ? { status: 'ok', workspace: w } : { status: 'none' }
  },
}))
vi.mock('@/lib/supabase/server', () => ({
  createServerSupabase: () => ({
    from(table: string) {
      const record = { table, filters: [] as Filter[], limit: null as number | null }
      state.queries.push(record)
      const result = () =>
        state.throws
          ? Promise.reject(state.throws)
          : Promise.resolve({ data: state.error ? null : state.rows, error: state.error })
      const builder = {
        select: () => builder,
        order: () => builder,
        eq: (column: string, value: unknown) => {
          record.filters.push({ column, value })
          return builder
        },
        gte: (column: string, value: unknown) => {
          record.filters.push({ column, value })
          return builder
        },
        limit: (n: number) => {
          record.limit = n
          return result()
        },
        then: (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) =>
          result().then(res, rej),
      }
      return builder
    },
  }),
}))

const { readPublishSummary, PUBLISH_LIMIT } = await import('./publishing')
const { readPostCounts, COUNTS_LIMIT } = await import('./posts')

beforeEach(() => {
  state.queries = []
  state.workspace = { id: WORKSPACE }
  state.rows = []
  state.error = null
  state.throws = null
})

describe('readPublishSummary', () => {
  const log = (over: Record<string, unknown> = {}) => ({
    status: 'succeeded',
    mode: 'live',
    channel: 'x',
    created_at: '2026-07-26T10:00:00.000Z',
    ...over,
  })

  test('is scoped to the workspace and capped', async () => {
    await readPublishSummary(NOW)
    const q = state.queries[0]!

    expect(q.table).toBe('post_publish_logs')
    expect(q.filters.some((f) => f.column === 'workspace_id' && f.value === WORKSPACE)).toBe(true)
    expect(q.limit).toBe(PUBLISH_LIMIT)
  })

  test('counts outcomes and modes separately', async () => {
    state.rows = [
      log(),
      log({ mode: 'fixture' }),
      log({ status: 'failed' }),
      log({ status: 'failed', mode: 'fixture' }),
    ]
    const summary = await readPublishSummary(NOW)

    expect(summary.attempts).toBe(4)
    expect(summary.succeeded).toBe(2)
    expect(summary.failed).toBe(2)
    // Mode counts only SUCCEEDED attempts: a failed live attempt published
    // nothing, so counting it as a live publish would overstate what went out.
    expect(summary.live).toBe(1)
    expect(summary.fixture).toBe(1)
  })

  test('no logs is EMPTY — the normal state for a new workspace', async () => {
    expect((await readPublishSummary(NOW)).status).toBe('empty')
  })

  test('a failed read is UNREADABLE, never a confident zero', async () => {
    state.error = { code: 'PGRST301', message: 'nope' }
    const summary = await readPublishSummary(NOW)

    expect(summary.status).toBe('unreadable')
    expect(summary.attempts).toBe(0)
  })

  test('a thrown read is unreadable too', async () => {
    state.throws = new Error('ETIMEDOUT')
    expect((await readPublishSummary(NOW)).status).toBe('unreadable')
  })

  test('a full page reports capped with the date it covers from', async () => {
    state.rows = Array.from({ length: PUBLISH_LIMIT }, (_, i) =>
      log({ created_at: i === 0 ? '2026-07-10T00:00:00.000Z' : '2026-07-26T00:00:00.000Z' }),
    )
    const summary = await readPublishSummary(NOW)

    expect(summary.capped).toBe(true)
    expect(summary.coveredFrom).toBe('2026-07-10')
  })

  test('an unknown mode is not counted as live', async () => {
    state.rows = [log({ mode: 'REAL' })]
    const summary = await readPublishSummary(NOW)

    expect(summary.live).toBe(0)
    expect(summary.fixture).toBe(0)
  })
})

describe('readPostCounts', () => {
  const post = (over: Record<string, unknown> = {}) => ({
    status: 'draft',
    origin: 'manual',
    channels: ['x'],
    updated_at: '2026-07-26T10:00:00.000Z',
    ...over,
  })

  test('is scoped to the workspace and capped', async () => {
    await readPostCounts()
    const q = state.queries[0]!

    expect(q.table).toBe('posts')
    expect(q.filters.some((f) => f.column === 'workspace_id' && f.value === WORKSPACE)).toBe(true)
    expect(q.limit).toBe(COUNTS_LIMIT)
  })

  test('counts by status, origin and channel', async () => {
    state.rows = [
      post({ status: 'draft', origin: 'plan_week', channels: ['x', 'gbp'] }),
      post({ status: 'draft' }),
      post({ status: 'published', channels: ['gbp'] }),
    ]
    const counts = await readPostCounts()

    expect(counts.byStatus.draft).toBe(2)
    expect(counts.byStatus.published).toBe(1)
    expect(counts.byOrigin.plan_week).toBe(1)
    expect(counts.byOrigin.manual).toBe(2)
    expect(counts.byChannel.find((c) => c.channel === 'gbp')?.count).toBe(2)
  })

  /**
   * The defect this file could not see.
   *
   * `posts.origin` is CHECK-constrained, and production widened it twice without
   * this module hearing about it — 'playbook' and then 'radar'. The counter's
   * `else` branch meant every draft of both kinds was counted as 'manual', which
   * is the value the product uses to mean A PERSON WROTE THIS BY HAND.
   *
   * It is a separate test rather than another row in the one above, because
   * adding a row there would take that test's `manual` count to 3 and its
   * assertion of 2 would fail for a reason unrelated to what it checks.
   */
  test('an origin this code has never heard of is not counted as hand-written', async () => {
    state.rows = [post({ origin: 'playbook' })]
    const counts = await readPostCounts()

    expect(counts.total).toBe(1)
    expect(counts.byOrigin.manual ?? 0).toBe(0)
    expect(counts.byOrigin.playbook).toBe(1)
  })

  test('an origin that is not a string is counted in the total and in no bucket', async () => {
    state.rows = [post({ origin: { nope: true } })]
    const counts = await readPostCounts()

    expect(counts.total).toBe(1)
    expect(Object.keys(counts.byOrigin)).toEqual([])
  })

  test('a repeated channel on one post counts once', async () => {
    // `posts.channels` is a bare text[] with no unique constraint, so a repeated
    // value is storable and would otherwise inflate the count.
    state.rows = [post({ channels: ['x', 'x'] })]

    expect((await readPostCounts()).byChannel.find((c) => c.channel === 'x')?.count).toBe(1)
  })

  test('no posts is EMPTY', async () => {
    expect((await readPostCounts()).status).toBe('empty')
  })

  test('a failed read is UNREADABLE, not zero posts', async () => {
    state.error = { code: 'PGRST301', message: 'nope' }
    const counts = await readPostCounts()

    expect(counts.status).toBe('unreadable')
    expect(counts.total).toBe(0)
  })

  test('a full page reports capped with its coverage date', async () => {
    state.rows = Array.from({ length: COUNTS_LIMIT }, (_, i) =>
      post({ updated_at: i === 0 ? '2026-07-01T00:00:00.000Z' : '2026-07-26T00:00:00.000Z' }),
    )
    const counts = await readPostCounts()

    expect(counts.capped).toBe(true)
    expect(counts.coveredFrom).toBe('2026-07-01')
  })

  test('a malformed row is dropped rather than counted under a bad key', async () => {
    state.rows = [post(), { status: 42, origin: null, channels: 'x' }]
    const counts = await readPostCounts()

    expect(counts.total).toBe(1)
  })
})
