import { beforeEach, describe, expect, test, vi } from 'vitest'

/**
 * The 30-day spend read.
 *
 * `readLedger` caps at 50 rows ordered `seq DESC`, which is unusable for a
 * month: a workspace that burns 50 entries in four days would render a "30-day"
 * chart covering four, and it would read as a quiet month rather than a
 * truncated one. Same class as the Reserved bug — a correct-looking view making
 * a false claim.
 *
 * So this read is date-filtered, and when it still hits its own cap it says the
 * DATE it actually covers. `seq DESC` truncation drops the OLDEST rows, so the
 * lost days are always at the far end of the chart — exactly where "nothing
 * happened" and "we did not look" are indistinguishable.
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

const { readSpend, SPEND_LIMIT, SPEND_DAYS } = await import('./spend')

/** A DEBIT `days` days before NOW. */
const debit = (daysAgo: number, amount: number, action = 'post_variants') => ({
  entry_type: 'DEBIT',
  amount,
  action_type: action,
  created_at: new Date(NOW.getTime() - daysAgo * 86_400_000).toISOString(),
})

beforeEach(() => {
  state.queries = []
  state.workspace = { id: WORKSPACE }
  state.rows = []
  state.error = null
  state.throws = null
})

describe('readSpend is scoped, filtered and capped', () => {
  test('filters to the workspace, to DEBIT, and to the window', async () => {
    await readSpend(NOW)

    expect(state.queries).toHaveLength(1)
    const q = state.queries[0]!
    expect(q.table).toBe('credit_ledger')
    expect(q.filters.some((f) => f.column === 'workspace_id' && f.value === WORKSPACE)).toBe(true)
    expect(q.filters.some((f) => f.column === 'entry_type' && f.value === 'DEBIT')).toBe(true)
    expect(q.filters.some((f) => f.column === 'created_at')).toBe(true)
    expect(q.limit).toBe(SPEND_LIMIT)
  })

  test('only DEBIT counts as spend — a HOLD reserves and moves no total', async () => {
    // Guarded by the query filter, asserted here so widening it is a test change
    // rather than a silent doubling of every number on the chart.
    const q = (await readSpend(NOW), state.queries[0]!)
    expect(q.filters.find((f) => f.column === 'entry_type')?.value).toBe('DEBIT')
  })
})

describe('readSpend never overstates its coverage', () => {
  test('an uncapped read reports the full window and no coverage note', async () => {
    state.rows = [debit(2, 3), debit(5, 20)]
    const spend = await readSpend(NOW)

    expect(spend.capped).toBe(false)
    expect(spend.coveredFrom).toBeNull()
    expect(spend.days).toHaveLength(SPEND_DAYS)
  })

  test('a FULL page is treated as capped — the oldest days may be missing', async () => {
    state.rows = Array.from({ length: SPEND_LIMIT }, (_, i) => debit(i % 30, 1))
    const spend = await readSpend(NOW)

    expect(spend.capped).toBe(true)
  })

  test('when capped it names the earliest date it actually covers', async () => {
    // `seq DESC` drops the OLDEST rows, so coverage starts at the oldest row
    // RETURNED, not at the window start. Reporting the window start would claim
    // 30 days of evidence for a chart holding four.
    const rows = Array.from({ length: SPEND_LIMIT }, (_, i) =>
      debit(i < SPEND_LIMIT - 1 ? 1 : 6, 1),
    )
    state.rows = rows
    const spend = await readSpend(NOW)

    expect(spend.capped).toBe(true)
    expect(spend.coveredFrom).toBe('2026-07-21')
  })

  test('the covered-from date is never later than the newest row', async () => {
    state.rows = Array.from({ length: SPEND_LIMIT }, () => debit(3, 1))
    const spend = await readSpend(NOW)

    expect(spend.coveredFrom).toBe('2026-07-24')
  })
})

describe('readSpend shapes the series honestly', () => {
  test('every day in the window appears, including zero days', async () => {
    // A day with no spend is a real zero and must plot as one. Omitting it would
    // let the line jump between distant points and imply activity in between.
    state.rows = [debit(0, 5)]
    const spend = await readSpend(NOW)

    expect(spend.days).toHaveLength(SPEND_DAYS)
    expect(spend.days.filter((d) => d.credits === 0)).toHaveLength(SPEND_DAYS - 1)
    expect(spend.days.at(-1)?.credits).toBe(5)
  })

  test('same-day entries sum', async () => {
    state.rows = [debit(1, 3), debit(1, 20), debit(1, 2)]
    const spend = await readSpend(NOW)

    expect(spend.days.at(-2)?.credits).toBe(25)
  })

  test('groups spend by action type, biggest first', async () => {
    state.rows = [
      debit(1, 3, 'post_variants'),
      debit(2, 50, 'brand_research'),
      debit(3, 2, 'post_variants'),
    ]
    const spend = await readSpend(NOW)

    expect(spend.byAction.map((a) => a.action)).toEqual(['brand_research', 'post_variants'])
    expect(spend.byAction[0]?.credits).toBe(50)
    expect(spend.byAction[1]?.credits).toBe(5)
  })

  test('an unknown action type is labelled, never dumped raw', async () => {
    state.rows = [debit(1, 4, 'some_new_action')]
    const spend = await readSpend(NOW)

    expect(spend.byAction[0]?.label).not.toBe('some_new_action')
    expect(spend.byAction[0]?.label.length).toBeGreaterThan(0)
  })

  test('total is the sum of the window', async () => {
    state.rows = [debit(1, 3), debit(2, 20)]

    expect((await readSpend(NOW)).total).toBe(23)
  })
})

describe('readSpend fails safe', () => {
  test('no workspace reads nothing and reports empty, not unreadable', async () => {
    state.workspace = null
    const spend = await readSpend(NOW)

    expect(state.queries).toHaveLength(0)
    expect(spend.status).toBe('empty')
    expect(spend.total).toBe(0)
  })

  test('a PostgREST error is UNREADABLE — never an empty chart', async () => {
    // An empty chart says "you spent nothing". A failed read must not make that
    // claim: the honest answer is that we could not read it.
    state.error = { code: 'PGRST301', message: 'JWT expired' }
    const spend = await readSpend(NOW)

    expect(spend.status).toBe('unreadable')
    expect(spend.days).toHaveLength(0)
  })

  test('a thrown read is unreadable too', async () => {
    state.throws = new Error('ETIMEDOUT')

    expect((await readSpend(NOW)).status).toBe('unreadable')
  })

  test('zero rows is genuinely EMPTY — a real new workspace', async () => {
    state.rows = []
    const spend = await readSpend(NOW)

    expect(spend.status).toBe('empty')
    expect(spend.total).toBe(0)
  })

  test('a malformed row is dropped rather than coerced into a number', async () => {
    state.rows = [debit(1, 3), { entry_type: 'DEBIT', amount: 'lots', created_at: null }]
    const spend = await readSpend(NOW)

    expect(spend.total).toBe(3)
  })
})
