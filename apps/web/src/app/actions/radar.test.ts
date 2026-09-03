import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { RadarChange, RadarSnapshot } from '@/lib/radar/types'

/**
 * RADAR'S ACTIONS ANSWER IN PRODUCT COPY AND NEVER REJECT.
 *
 * ── THE TWO DEFECTS THIS FILE PINS ───────────────────────────────────────────
 * 1. `addCompetitor` and `removeCompetitor` returned `cause.message` from the
 *    store as the customer's sentence, and the store builds that sentence by
 *    interpolating what PostgREST said: a shop owner read "Could not add that
 *    competitor: relation "x" does not exist". The raw text belongs in the server
 *    log, through `reportServerError`; the screen gets a sentence about their
 *    watch list.
 * 2. `draftFromRadarChange` and `connectedChannels` ran their reads outside any
 *    try, so a Radar read that threw rejected the action and the dialog got
 *    Next's error overlay instead of a `DraftFromChangeState`.
 *
 * ── AND THE VOCABULARY ───────────────────────────────────────────────────────
 * Both channel filters were the literal ['x','gbp','linkedin','instagram'], so a
 * shop with only a Facebook Page connected was offered nothing and could draft
 * for nothing. The filter is `ChannelSchema` now, and a Facebook request goes
 * through.
 */

const state = vi.hoisted(() => ({
  userId: 'user_radar' as string | null,
  workspace: { id: '33333333-3333-4333-8333-333333333333', name: 'W', slug: 'w' },
  addRejects: null as Error | null,
  removeRejects: null as Error | null,
  readRejects: null as Error | null,
  readCalls: 0,
  snapshot: null as unknown as RadarSnapshot,
  inserted: [] as Array<{ table: string; row: Record<string, unknown> }>,
  insertError: null as { message: string } | null,
  generateCalls: [] as Array<{ postId: string; channels: string[] }>,
  connections: [] as Array<{ platform: string }>,
  connectionsError: null as { message: string; code?: string } | null,
  connectionsThrow: null as Error | null,
  reported: [] as Array<{ error: unknown; context: { action: string } }>,
}))

vi.mock('server-only', () => ({}))
vi.mock('@clerk/nextjs/server', () => ({ auth: () => Promise.resolve({ userId: state.userId }) }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/observability/report', () => ({
  reportServerError: (error: unknown, context: { action: string }) => {
    state.reported.push({ error, context })
  },
}))
vi.mock('@/lib/workspaces', () => ({
  getActiveWorkspace: () => Promise.resolve(state.workspace),
  workspaceForWrite: () => Promise.resolve({ ok: true, workspace: state.workspace }),
}))
vi.mock('@/lib/radar/read', () => ({
  radarStore: () => ({
    add: () =>
      state.addRejects ? Promise.reject(state.addRejects) : Promise.resolve({ id: 'comp-1' }),
    remove: () => (state.removeRejects ? Promise.reject(state.removeRejects) : Promise.resolve()),
    read: () => {
      state.readCalls += 1
      return state.readRejects ? Promise.reject(state.readRejects) : Promise.resolve(state.snapshot)
    },
  }),
}))
vi.mock('@/lib/radar/brief', () => ({
  briefFromChange: () => ({ title: 'Rival dropped prices', body: 'Say something true about it.' }),
}))
vi.mock('@/app/actions/posts-ai', () => ({
  generateVariants: (postId: string, channels: string[]) => {
    state.generateCalls.push({ postId, channels })
    return Promise.resolve({ ok: true, variants: channels.map(() => ({})), creditsCharged: 12 })
  },
}))
vi.mock('@/lib/supabase/server', () => ({
  createServerSupabase: () => ({
    from: (table: string) => ({
      insert: (row: Record<string, unknown>) => {
        state.inserted.push({ table, row })
        return {
          select: () => ({
            single: () =>
              Promise.resolve(
                state.insertError
                  ? { data: null, error: state.insertError }
                  : { data: { id: 'post-1' }, error: null },
              ),
          }),
        }
      },
      select: () => ({
        eq: () => ({
          eq: () => {
            if (state.connectionsThrow) return Promise.reject(state.connectionsThrow)
            return Promise.resolve({ data: state.connections, error: state.connectionsError })
          },
        }),
      }),
    }),
  }),
}))

const { addCompetitor, connectedChannels, draftFromRadarChange, removeCompetitor } =
  await import('./radar')

const CHANGE = {
  id: 'chg-1',
  competitorId: 'comp-1',
  competitorName: 'Rival',
  kind: 'price_change',
  observedOn: '2026-09-01',
  evidence: [],
  observation: { kind: 'price_change' },
  reading: null,
} as unknown as RadarChange

const RAW_PG = 'relation "competitor_subscriptions" does not exist'

beforeEach(() => {
  state.userId = 'user_radar'
  state.addRejects = null
  state.removeRejects = null
  state.readRejects = null
  state.readCalls = 0
  state.snapshot = {
    collector: 'present',
    competitors: [],
    days: [{ date: '2026-09-01', changes: [CHANGE], attempts: [] }],
  } as unknown as RadarSnapshot
  state.inserted = []
  state.insertError = null
  state.generateCalls = []
  state.connections = []
  state.connectionsError = null
  state.connectionsThrow = null
  state.reported = []
})

describe('addCompetitor never shows the customer what Postgres said', () => {
  it('replaces a raw store failure with a sentence about the watch list, and logs the raw one', async () => {
    state.addRejects = new Error(`Could not add that competitor: ${RAW_PG}`)
    const out = await addCompetitor('Rival', 'https://rival.example', 'website')
    expect(out).toMatchObject({ ok: false, reason: 'failed' })
    const message = (out as { message: string }).message
    expect(message).not.toMatch(/relation|competitor_subscriptions|does not exist/)
    expect(message).toMatch(/could not add/i)
    expect(message).toMatch(/watch list/i)
    // The raw text went to the server log, with the action named.
    expect(state.reported).toHaveLength(1)
    expect(state.reported[0]!.context.action).toBe('addCompetitor')
    expect((state.reported[0]!.error as Error).message).toContain(RAW_PG)
  })

  it("passes the store's own refusal through when it is written for the customer", async () => {
    state.addRejects = new Error('Only an owner or an editor can add a competitor to watch.')
    const out = await addCompetitor('Rival', 'https://rival.example', 'website')
    expect(out).toMatchObject({
      ok: false,
      reason: 'failed',
      message: 'Only an owner or an editor can add a competitor to watch.',
    })
    expect(state.reported).toHaveLength(0)
  })

  it('still reports "not collecting" as its own reason', async () => {
    state.addRejects = new Error('Radar is not collecting yet.')
    const out = await addCompetitor('Rival', 'https://rival.example', 'website')
    expect(out).toMatchObject({ ok: false, reason: 'not-collecting' })
  })
})

describe('removeCompetitor never shows the customer what Postgres said', () => {
  it('says the business is still on the list, without the Postgres text', async () => {
    state.removeRejects = new Error(`Could not stop watching that competitor: ${RAW_PG}`)
    const out = await removeCompetitor('comp-1')
    expect(out.ok).toBe(false)
    const message = (out as { message: string }).message
    expect(message).not.toMatch(/relation|does not exist/)
    expect(message).toMatch(/still on your watch list/i)
    expect(state.reported[0]!.context.action).toBe('removeCompetitor')
  })
})

describe('draftFromRadarChange resolves on every failure', () => {
  it('returns a state, not a rejection, when the Radar read throws', async () => {
    state.readRejects = new Error(`Could not read the watch list: ${RAW_PG}`)
    const out = await draftFromRadarChange('chg-1', ['instagram'])
    expect(out).toMatchObject({ ok: false, insufficient: false, postId: null })
    const message = (out as { message: string }).message
    expect(message).not.toMatch(/relation|does not exist/)
    expect(message).toMatch(/could not read your radar/i)
    expect(message).toMatch(/no draft was started/i)
    expect(state.inserted).toHaveLength(0)
    expect(state.reported[0]!.context.action).toBe('draftFromRadarChange')
  })

  // ── WHY THESE TWO STOP AT THE CHANNEL GATE ───────────────────────────────
  // They cannot assert `ok: true`, and the reason is a defect outside this file:
  // These two used to carry a note that `PostOriginSchema` refused `origin:
  // 'radar'`, so the action had never produced a draft: the migration
  // `20260822090000_posts_origin_radar.sql` widened the column on 2026-08-22 and
  // the zod enum was never widened with it. FIXED 2026-09-03; the seam itself is
  // now guarded by `packages/db/tests/post_origin_enum.test.ts`, which compares
  // the enum against the migration's own SQL. The property under test here is
  // unchanged: a Facebook or Telegram request passes the channel gate and
  // reaches the Radar read.
  it('drafts for Facebook: the request is not refused as empty', async () => {
    const out = await draftFromRadarChange('chg-1', ['facebook'])
    expect((out as { message?: string }).message).not.toBe(
      'Pick at least one channel to write for.',
    )
    expect(state.readCalls).toBe(1)
  })

  it('lets a Telegram request through and drops a platform that is not a channel', async () => {
    const out = await draftFromRadarChange('chg-1', ['telegram', 'tiktok', 'telegram'])
    expect((out as { message?: string }).message).not.toBe(
      'Pick at least one channel to write for.',
    )
    expect(state.readCalls).toBe(1)
  })

  it('drafts for real, now that the origin the column admits is one the schema admits too', async () => {
    // RETARGETED 2026-09-03. This test used to prove that a REFUSED row produced
    // a sentence about the draft rather than about Radar, and the row was refused
    // because of the enum gap named above. With the gap closed the same call
    // succeeds, which is the whole point, so the test now pins the success and
    // its sibling below keeps the refusal sentence covered through a failure
    // that can still happen.
    const out = await draftFromRadarChange('chg-1', ['instagram'])
    expect(out).toMatchObject({ ok: true, postId: 'post-1' })
    expect(state.reported).toEqual([])
  })

  it('says the draft could not be started, not that Radar was unreadable, when the insert fails', async () => {
    // The refusal sentence still has a path: the database can refuse the row for
    // its own reasons. What must not happen is Radar being blamed for it, since
    // the Radar read had already succeeded by then.
    state.insertError = { message: 'insert refused' }
    const out = await draftFromRadarChange('chg-1', ['instagram'])
    expect(out).toMatchObject({
      ok: false,
      insufficient: false,
      postId: null,
      message: 'Could not start a draft from that change.',
    })
    expect(state.reported[0]!.context.action).toBe('draftFromRadarChange')
  })

  it('still refuses a request with no channel in it', async () => {
    const out = await draftFromRadarChange('chg-1', ['tiktok'])
    expect(out).toMatchObject({ ok: false, message: 'Pick at least one channel to write for.' })
  })
})

describe('connectedChannels', () => {
  it('offers Facebook and Telegram when they are connected', async () => {
    state.connections = [
      { platform: 'facebook' },
      { platform: 'telegram' },
      { platform: 'tiktok' },
      { platform: 'instagram' },
      { platform: 'instagram' },
    ]
    expect(await connectedChannels()).toEqual(['facebook', 'telegram', 'instagram'])
  })

  it('resolves, and logs, when the connections read throws', async () => {
    state.connectionsThrow = new Error('fetch failed')
    await expect(connectedChannels()).resolves.toEqual([])
    expect(state.reported[0]!.context.action).toBe('connectedChannels')
  })

  it('logs a query error rather than swallowing it', async () => {
    state.connectionsError = { message: RAW_PG, code: '42P01' }
    await expect(connectedChannels()).resolves.toEqual([])
    expect(state.reported).toHaveLength(1)
  })
})
