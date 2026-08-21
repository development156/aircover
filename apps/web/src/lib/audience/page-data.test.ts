import { describe, expect, test, vi, beforeEach } from 'vitest'

import { MAX_TREND_DAYS, readCollectedHistory } from './page-data'
import { createServerSupabase } from '@/lib/supabase/server'

/**
 * The follower record, read as the screen reads it.
 *
 * ── THE DEFECT THIS FILE EXISTS FOR ──────────────────────────────────────────
 * The first version selected EVERY row for the account — four dimensions, up to
 * forty-five buckets each, two populations, so roughly 360 rows PER DAY on a
 * populated account — and picked the follower series out in JavaScript under a
 * 2000-row ceiling ordered ASCENDING. That is about five days of history, and the
 * ceiling kept the OLDEST five: the chart would have frozen on the first week and
 * the sentence under it would have said "Kept by Sahoda: 5 days, <first> to
 * <fifth>" while the table held a month.
 *
 * No test caught it because every fixture had four rows. So the assertions below
 * are the ones that would have: the query must SELECT the series rather than
 * filter it afterwards, it must order NEWEST FIRST so a ceiling drops old days
 * rather than current ones, and the window the note prints must come from the
 * same rows the chart is drawn from.
 */

vi.mock('@/lib/supabase/server', () => ({ createServerSupabase: vi.fn() }))
vi.mock('server-only', () => ({}))

const mockedClient = vi.mocked(createServerSupabase)

const WS = '11111111-1111-4111-8111-111111111111'
const ACCT = '6a81aff477555aae0149e261'

interface Recorded {
  filters: Record<string, unknown>
  order: { column: string; ascending?: boolean } | null
  limit: number | null
}

/**
 * A Supabase query double that RECORDS what was asked for.
 *
 * The point is not to replay rows — it is to assert the shape of the QUERY, because
 * the defect was entirely in the query and any fixture small enough to write by hand
 * passes with or without the fix.
 */
function clientReturning(rows: Array<Record<string, unknown>>): { recorded: Recorded } {
  const recorded: Recorded = { filters: {}, order: null, limit: null }
  const builder: Record<string, unknown> = {}
  const chain = (): unknown => builder
  builder.select = chain
  builder.eq = (column: string, value: unknown) => {
    recorded.filters[column] = value
    return builder
  }
  builder.order = (column: string, opts?: { ascending?: boolean }) => {
    recorded.order = { column, ascending: opts?.ascending }
    return builder
  }
  builder.limit = (n: number) => {
    recorded.limit = n
    return Promise.resolve({ data: rows, error: null })
  }
  mockedClient.mockReturnValue({ from: () => builder } as never)
  return { recorded }
}

/** `days` rows, newest first — the order the fixed query asks for. */
function series(days: number): Array<Record<string, unknown>> {
  return Array.from({ length: days }, (_, i) => {
    const day = new Date(Date.UTC(2024, 0, 1) + (days - 1 - i) * 86_400_000)
    return { measured_on: day.toISOString().slice(0, 10), value: String(1000 + (days - 1 - i)) }
  })
}

beforeEach(() => {
  mockedClient.mockReset()
})

describe('the query, not the loop, is what picks the follower series', () => {
  test('filters the dimension and the bucket in the DATABASE', async () => {
    const { recorded } = clientReturning(series(3))
    await readCollectedHistory(WS, ACCT)
    // Without these two the read pulls every demographic bucket for every day and
    // the ceiling becomes a handful of days rather than years.
    expect(recorded.filters.dimension).toBe('follower_count')
    expect(recorded.filters.bucket).toBe('total')
    expect(recorded.filters.workspace_id).toBe(WS)
    expect(recorded.filters.account_id).toBe(ACCT)
  })

  test('asks NEWEST FIRST, so a ceiling drops old days rather than current ones', async () => {
    const { recorded } = clientReturning(series(3))
    await readCollectedHistory(WS, ACCT)
    // A trend missing last year is a shorter line. A trend missing this week is a
    // wrong one, and it reads as "nothing is happening".
    expect(recorded.order).toEqual({ column: 'measured_on', ascending: false })
  })

  test('the ceiling is years, not days', async () => {
    const { recorded } = clientReturning(series(3))
    await readCollectedHistory(WS, ACCT)
    expect(recorded.limit).toBe(MAX_TREND_DAYS)
    expect(MAX_TREND_DAYS).toBeGreaterThan(365)
  })
})

describe('what the screen is told about the window', () => {
  test('hands the chart oldest-first even though it asked newest-first', async () => {
    clientReturning(series(4))
    const history = await readCollectedHistory(WS, ACCT)
    expect(history.followers.map((f) => f.day)).toEqual([
      '2024-01-01',
      '2024-01-02',
      '2024-01-03',
      '2024-01-04',
    ])
  })

  test('states a window drawn from the SAME rows as the chart', async () => {
    // The half that made the old bug a lie rather than merely a short chart: the
    // note printed a date range computed from a different set than the line.
    clientReturning(series(4))
    const history = await readCollectedHistory(WS, ACCT)
    expect(history.firstDay).toBe(history.followers[0]?.day)
    expect(history.lastDay).toBe(history.followers[history.followers.length - 1]?.day)
    expect(history.days).toBe(history.followers.length)
  })

  test('keeps the NEWEST days when the ceiling bites, and says that it did', async () => {
    // The assertion that would have caught it. More rows than the ceiling, and the
    // current day must survive.
    clientReturning(series(MAX_TREND_DAYS))
    const history = await readCollectedHistory(WS, ACCT)
    expect(history.followers).toHaveLength(MAX_TREND_DAYS)
    expect(history.truncated).toBe(true)
    // The last row of a newest-first fixture of length N is the oldest; after the
    // reverse the newest must be last.
    expect(history.lastDay).toBe(history.followers[history.followers.length - 1]?.day)
  })

  test('says nothing is truncated when nothing is', async () => {
    clientReturning(series(4))
    expect((await readCollectedHistory(WS, ACCT)).truncated).toBe(false)
  })
})

describe('a row that cannot be narrowed is dropped, never coerced', () => {
  test('drops an unparseable value rather than drawing a collapse to zero', async () => {
    clientReturning([
      { measured_on: '2024-01-02', value: 'not-a-number' },
      { measured_on: '2024-01-01', value: '1000' },
    ])
    const history = await readCollectedHistory(WS, ACCT)
    expect(history.followers).toEqual([{ day: '2024-01-01', followers: 1000 }])
  })

  test('keeps a genuine zero', async () => {
    clientReturning([{ measured_on: '2024-01-01', value: '0' }])
    expect((await readCollectedHistory(WS, ACCT)).followers).toEqual([
      { day: '2024-01-01', followers: 0 },
    ])
  })

  test('a failed read is not "no followers"', async () => {
    const builder: Record<string, unknown> = {}
    const chain = (): unknown => builder
    builder.select = chain
    builder.eq = chain
    builder.order = chain
    builder.limit = () => Promise.resolve({ data: null, error: { message: 'boom' } })
    mockedClient.mockReturnValue({ from: () => builder } as never)

    const history = await readCollectedHistory(WS, ACCT)
    // `storing: false` is what the screen states as "no history kept yet" — true of
    // a failed read AND of a missing table, and it promises nothing either way.
    expect(history.storing).toBe(false)
    expect(history.followers).toEqual([])
    expect(history.firstDay).toBeNull()
  })
})
