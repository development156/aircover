import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * "READ NOW" REFUSES BEFORE IT SPENDS, AND ANSWERS IN PRODUCT COPY.
 *
 * ── WHAT THIS FILE CAN PROVE, AND WHAT IT DELIBERATELY LEAVES TO THE RUNNER ──
 * The runner is mocked here, so this proves the DECISIONS this action owns:
 * whether the runner is reached at all, with which workspace, and what each
 * report shape becomes on screen. Whether one press charges one workspace once
 * is proved where the ledger is real — `apps/jobs/src/radar/run.only.test.ts`,
 * against `FakeLedger`, which replays idempotency keys the way
 * `app.apply_ledger_entry` does.
 *
 * Splitting it that way is not a gap. A test that let a fake ledger through
 * this module would be measuring the ledger; what can only be measured HERE is
 * that a competitor the caller does not watch never reaches the runner in the
 * first place.
 *
 * ── THE ASSERTION THAT MATTERS MOST IS A ZERO ───────────────────────────────
 * `expect(state.runs).toHaveLength(0)` on the foreign-competitor case. A test
 * that only checked the returned sentence would pass just as happily against an
 * action that read the page first and apologised afterwards, which is a gate
 * that pays the bill and then complains.
 */

const WS = '33333333-3333-4333-8333-333333333333'
const MINE = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
const THEIRS = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'

interface Report {
  considered: number
  unchanged: number
  changed: number
  couldNotCheck: number
  refused: Array<{ sourceId: string; reason: string }>
  snapshotsWritten: number
  changesWritten: number
  spendMicros: { measured: number; estimated: number; free: number }
  freeCheckRate: number
  credits: { debited: number; unpaid: number }
}

function report(over: Partial<Report> = {}): Report {
  return {
    considered: 1,
    unchanged: 0,
    changed: 0,
    couldNotCheck: 0,
    refused: [],
    snapshotsWritten: 0,
    changesWritten: 0,
    spendMicros: { measured: 0, estimated: 0, free: 0 },
    freeCheckRate: 0,
    credits: { debited: 0, unpaid: 0 },
    ...over,
  }
}

const state = vi.hoisted(() => ({
  userId: 'user_radar' as string | null,
  /** Which competitor ids this workspace is subscribed to. */
  watching: [] as string[],
  subscriptionError: null as { message: string } | null,
  runs: [] as Array<{ competitorId: string; workspaceId: string }>,
  nextReport: null as unknown,
  runThrows: null as Error | null,
  revalidated: [] as string[],
  reported: [] as Array<{ action: string }>,
}))

vi.mock('server-only', () => ({}))
vi.mock('@clerk/nextjs/server', () => ({ auth: () => Promise.resolve({ userId: state.userId }) }))
vi.mock('next/cache', () => ({
  revalidatePath: (path: string) => {
    state.revalidated.push(path)
  },
}))
vi.mock('@/lib/observability/report', () => ({
  reportServerError: (_error: unknown, context: { action: string }) => {
    state.reported.push({ action: context.action })
  },
}))
vi.mock('@/lib/workspaces', () => ({
  getActiveWorkspace: () => Promise.resolve({ id: WS, name: 'W', slug: 'w' }),
  workspaceForWrite: () =>
    Promise.resolve({ ok: true, workspace: { id: WS, name: 'W', slug: 'w' } }),
}))
vi.mock('@/lib/radar/read', () => ({ radarStore: () => ({}) }))
vi.mock('@/lib/radar/brief', () => ({ briefFromChange: () => ({ title: '', body: '' }) }))
vi.mock('@/app/actions/posts-ai', () => ({ generateVariants: () => Promise.resolve({ ok: true }) }))

/** The caller's own session client: the subscription check reads through RLS. */
vi.mock('@/lib/supabase/server', () => ({
  createServerSupabase: () => ({
    from: () => {
      const filters: Record<string, unknown> = {}
      const builder = {
        select: () => builder,
        eq: (column: string, value: unknown) => {
          filters[column] = value
          return builder
        },
        maybeSingle: () => {
          if (state.subscriptionError)
            return Promise.resolve({ data: null, error: state.subscriptionError })
          const wanted = String(filters.competitor_id ?? '')
          const watched = filters.workspace_id === WS && state.watching.includes(wanted)
          return Promise.resolve({ data: watched ? { competitor_id: wanted } : null, error: null })
        },
      }
      return builder
    },
  }),
}))

vi.mock('@sahoda/jobs/radar', () => ({
  readCompetitorNow: (input: { competitorId: string; workspaceId: string }) => {
    state.runs.push(input)
    if (state.runThrows) return Promise.reject(state.runThrows)
    return Promise.resolve(state.nextReport)
  },
}))

beforeEach(() => {
  state.userId = 'user_radar'
  state.watching = [MINE]
  state.subscriptionError = null
  state.runs = []
  state.nextReport = report()
  state.runThrows = null
  state.revalidated = []
  state.reported = []
})

describe('readCompetitorNow', () => {
  it('never reaches the runner for a business this workspace does not watch', async () => {
    const { readCompetitorNow } = await import('./radar')
    const result = await readCompetitorNow(THEIRS)

    expect(state.runs).toHaveLength(0)
    expect(result).toEqual({
      ok: false,
      reason: 'not-watching',
      message: expect.stringContaining('not on your watch list'),
    })
  })

  it('runs for the caller’s own workspace and revalidates the screen', async () => {
    state.nextReport = report({ changed: 1, changesWritten: 2, credits: { debited: 1, unpaid: 0 } })
    const { readCompetitorNow } = await import('./radar')
    const result = await readCompetitorNow(MINE)

    expect(state.runs).toEqual([{ competitorId: MINE, workspaceId: WS }])
    expect(state.revalidated).toContain('/radar')
    expect(result).toMatchObject({ ok: true, outcome: 'moved' })
  })

  it('says the balance is short, and that nothing was charged', async () => {
    state.nextReport = report({
      refused: [{ sourceId: 's1', reason: 'CREDIT_INSUFFICIENT' }],
      credits: { debited: 0, unpaid: 1 },
    })
    const { readCompetitorNow } = await import('./radar')
    const result = await readCompetitorNow(MINE)

    expect(result).toMatchObject({ ok: false, reason: 'insufficient' })
    expect(result.message).toMatch(/nothing was charged/i)
  })

  it('tells Sahoda’s own daily cap apart from the customer’s wallet', async () => {
    state.nextReport = report({ refused: [{ sourceId: 's1', reason: 'DAILY_CAP' }] })
    const { readCompetitorNow } = await import('./radar')
    const result = await readCompetitorNow(MINE)

    // Not `insufficient`: the limit is ours, so the remedy is not a top-up.
    expect(result).toMatchObject({ ok: false, reason: 'capped' })
    expect(result.message).not.toMatch(/your balance/i)
  })

  it('reports a page that would not load as a gap, never as "nothing changed"', async () => {
    state.nextReport = report({ couldNotCheck: 1 })
    const { readCompetitorNow } = await import('./radar')
    const result = await readCompetitorNow(MINE)

    expect(result).toMatchObject({ ok: true, outcome: 'could-not-read' })
    expect(result.message).not.toMatch(/nothing changed|the same as/i)
    expect(result.message).toMatch(/nothing was charged/i)
  })

  it('does not claim "nothing changed" on a first read', async () => {
    state.nextReport = report({ changed: 1, snapshotsWritten: 1, changesWritten: 0 })
    const { readCompetitorNow } = await import('./radar')
    const result = await readCompetitorNow(MINE)

    expect(result).toMatchObject({ ok: true, outcome: 'read' })
    expect(result.message).toMatch(/first read/i)
  })

  it('reports an unchanged page as read and unchanged', async () => {
    state.nextReport = report({ unchanged: 1 })
    const { readCompetitorNow } = await import('./radar')
    const result = await readCompetitorNow(MINE)

    expect(result).toMatchObject({ ok: true, outcome: 'unchanged' })
  })

  it('never rejects when the runner throws, and logs the cause server-side', async () => {
    state.runThrows = new Error('SUPABASE_DB_URL missing')
    const { readCompetitorNow } = await import('./radar')
    const result = await readCompetitorNow(MINE)

    expect(result).toMatchObject({ ok: false, reason: 'failed' })
    // The customer never sees the env name; the operator does.
    expect(result.message).not.toMatch(/SUPABASE/)
    expect(state.reported).toEqual([{ action: 'readCompetitorNow' }])
  })

  it('refuses a signed-out caller before any read', async () => {
    state.userId = null
    const { readCompetitorNow } = await import('./radar')
    const result = await readCompetitorNow(MINE)

    expect(state.runs).toHaveLength(0)
    expect(result).toMatchObject({ ok: false, reason: 'failed' })
  })
})
