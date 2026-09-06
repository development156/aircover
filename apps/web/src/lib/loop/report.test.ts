import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * THE CMO REPORT'S FIGURES — every one from a query, or absent.
 *
 * ── WHY THIS FILE DID NOT EXIST AND SHOULD HAVE ──────────────────────────────
 * `lib/loop/report.ts` owns four of the five figures the Monday report prints,
 * and had no unit test at all. The page around it is well covered by scans that
 * check no invented DIGIT reaches the screen; nothing checked that the numbers
 * which DO reach it mean what the report says they mean.
 *
 * The two claims below are the ones a customer acts on: "this was your best
 * post" and "here is what Sahoda learned this week". Both are wrong in ways a
 * digit scan cannot see — a ranking of one post, and a cycle's learnings lost
 * behind a limit.
 */

const state = vi.hoisted(() => ({
  snapshots: [] as Record<string, unknown>[],
  posts: [] as Record<string, unknown>[],
  liveLogs: null as Record<string, unknown>[] | null,
  events: [] as Record<string, unknown>[],
  /** Every .eq() the memory_events read applied, so the filter can be asserted. */
  eventFilters: [] as [string, unknown][],
}))

vi.mock('server-only', () => ({}))

/**
 * A chainable stub shaped like the query builder, resolving to whatever table
 * was asked for. Thenable rather than terminal-method-based, because these
 * reads end at different methods and awaiting the builder is what the real
 * client does.
 */
vi.mock('@/lib/supabase/server', () => {
  function builder(table: string) {
    const rows = () =>
      table === 'post_metric_snapshots'
        ? state.snapshots
        : table === 'posts'
          ? state.posts
          : table === 'post_publish_logs'
            ? // Every post is live unless a test says otherwise (IL-08 below).
              (state.liveLogs ?? state.posts.map((p) => ({ post_id: p.id })))
            : state.events
    const chain: Record<string, unknown> = {
      select: () => chain,
      eq: (col: string, val: unknown) => {
        if (table === 'memory_events') state.eventFilters.push([col, val])
        return chain
      },
      gte: () => chain,
      lte: () => chain,
      in: () => chain,
      order: () => chain,
      limit: () => chain,
      then: (resolve: (v: unknown) => unknown) => resolve({ data: rows(), error: null }),
    }
    return chain
  }
  return { createServerSupabase: () => ({ from: (t: string) => builder(t) }) }
})

const { readRanking, readCycleLearnings } = await import('@/lib/loop/report')

const WS = 'ws-1'

beforeEach(() => {
  state.snapshots = []
  state.posts = []
  state.events = []
  state.eventFilters = []
})

describe('readRanking', () => {
  it('is absent, not zero, when nothing was measured', async () => {
    expect(await readRanking(WS, '2026-08-17', '2026-08-23')).toBeNull()
  })

  /**
   * The claim this withholds is the useful one. With a single measured post
   * that post is simultaneously the best and the worst of the week, and
   * printing it as "your best post" is a ranking of one dressed as a finding.
   */
  it('withholds a ranking of one post, because one post is not a ranking', async () => {
    state.snapshots = [{ post_id: 'p1', channel: 'x', value: 900 }]
    expect(await readRanking(WS, '2026-08-17', '2026-08-23')).toBeNull()
  })

  it('a post that only a fixture ever published cannot be ranked (IL-08)', async () => {
    state.snapshots = [
      { post_id: 'p1', channel: 'x', value: 100 },
      { post_id: 'p2', channel: 'linkedin', value: 900 },
      { post_id: 'p3', channel: 'instagram', value: 5000 },
    ]
    state.posts = [
      { id: 'p1', title: 'Quiet one' },
      { id: 'p2', title: 'Loud one' },
      { id: 'p3', title: 'Fixture only' },
    ]
    state.liveLogs = [{ post_id: 'p1' }, { post_id: 'p2' }]
    const r = await readRanking(WS, '2026-08-17', '2026-08-23')
    expect(r?.top.title).toBe('Loud one')
    expect(r?.postsMeasured).toBe(2)
    state.liveLogs = null
  })

  it('names the top and the bottom once two posts were measured', async () => {
    state.snapshots = [
      { post_id: 'p1', channel: 'x', value: 100 },
      { post_id: 'p2', channel: 'linkedin', value: 900 },
    ]
    state.posts = [
      { id: 'p1', title: 'Quiet one' },
      { id: 'p2', title: 'Loud one' },
    ]
    const r = await readRanking(WS, '2026-08-17', '2026-08-23')
    expect(r?.top.title).toBe('Loud one')
    expect(r?.top.value).toBe(900)
    expect(r?.bottom.title).toBe('Quiet one')
    expect(r?.postsMeasured).toBe(2)
  })

  /**
   * A post measured on four days is ONE post. Summing its dailies would rank a
   * post that was measured more often above one that actually reached more
   * people, which is the report recommending the wrong thing to write next.
   */
  it('takes a post best reading, never the sum of its daily ones', async () => {
    state.snapshots = [
      { post_id: 'p1', channel: 'x', value: 300 },
      { post_id: 'p1', channel: 'x', value: 300 },
      { post_id: 'p1', channel: 'x', value: 300 },
      { post_id: 'p2', channel: 'linkedin', value: 800 },
    ]
    state.posts = [
      { id: 'p1', title: 'Measured often' },
      { id: 'p2', title: 'Actually reached more' },
    ]
    const r = await readRanking(WS, '2026-08-17', '2026-08-23')
    expect(r?.top.title).toBe('Actually reached more')
    expect(r?.top.value).toBe(800)
    // Two posts, not four measurements.
    expect(r?.postsMeasured).toBe(2)
  })

  /** A post whose title never came back is named honestly, never left blank. */
  it('falls back to Untitled rather than an empty name', async () => {
    state.snapshots = [
      { post_id: 'p1', channel: 'x', value: 100 },
      { post_id: 'p2', channel: 'x', value: 900 },
    ]
    state.posts = [{ id: 'p2', title: 'Known' }]
    // Both went out live; only the title row is missing.
    state.liveLogs = [{ post_id: 'p1' }, { post_id: 'p2' }]
    const r = await readRanking(WS, '2026-08-17', '2026-08-23')
    expect(r?.bottom.title).toBe('Untitled')
    state.liveLogs = null
  })
})

describe('readCycleLearnings', () => {
  /**
   * THE DEFECT THIS TEST EXISTS FOR. The read used to take the 20 most recent
   * insight events and filter for this cycle AFTERWARDS. A workspace with
   * twenty newer events than its last cycle's — a workspace that has been
   * running a while, not an unusual one — got an empty learnings block on a
   * report whose cycle really did propose something, and the page then said
   * Sahoda noticed nothing.
   */
  it('asks the database for this cycle, rather than filtering after a limit', async () => {
    await readCycleLearnings(WS, 'cycle-42')
    expect(state.eventFilters).toContainEqual(['diff->>loop_cycle_id', 'cycle-42'])
  })

  it('carries what became of each proposal, not just its words', async () => {
    state.events = [
      {
        diff: { summary: 'LinkedIn reached more people.', loop_cycle_id: 'cycle-42' },
        status: 'accepted',
        applied_memory_version: 7,
      },
    ]
    const r = await readCycleLearnings(WS, 'cycle-42')
    expect(r).toEqual([
      { summary: 'LinkedIn reached more people.', status: 'accepted', appliedVersion: 7 },
    ])
  })

  /** A proposal that recorded no summary is described, never invented. */
  it('does not invent a summary for a proposal that stored none', async () => {
    state.events = [{ diff: {}, status: 'pending', applied_memory_version: null }]
    const r = await readCycleLearnings(WS, 'cycle-42')
    expect(r[0]?.summary).toBe('Sahoda noticed something.')
    expect(r[0]?.appliedVersion).toBeNull()
  })
})
