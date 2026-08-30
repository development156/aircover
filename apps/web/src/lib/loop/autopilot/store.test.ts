import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * THE STORE'S OWN TRANSFORMATIONS, WHICH NO OTHER SUITE SEES.
 *
 * Three suites already cover the code either side of this file: the pglite
 * suite adjudicates every statement against a real Postgres, `row-mappers`
 * turns rows into the shapes the decisions read, and `decision-params` builds
 * the write's arguments. What none of them touches is the small amount of
 * judgement `store.ts` applies on its own — which column becomes which field,
 * what an absent row means, and where a missing value must stay missing.
 *
 * That judgement is where the dangerous mistakes live, because it is invisible
 * to the compiler:
 *
 *   `AutopilotSettings` has THREE `number | null` fields. Swapping the cap and
 *   the cancel window compiles, passes every other suite, and turns "three
 *   posts a day" into "three minutes to change your mind".
 *
 *   `readDial` must NOT default a channel nobody set. Its own header says a
 *   defaulted channel is how a product publishes somewhere nobody agreed to,
 *   and until now the header was the only thing saying it.
 *
 *   Every `?? null` is a claim that "we have no value" and "the value is zero"
 *   are different facts. A cap of 0 means publish nothing; a cap of null means
 *   the Loop was never opened. `decideOne` treats them differently.
 *
 * The pool is faked because the point is the mapping, not the SQL. Each test
 * asserts the STATEMENT it was handed as well as the result, so a function
 * quietly reading the wrong query is caught here rather than in production.
 */

const pool = vi.hoisted(() => ({ query: vi.fn() }))

vi.mock('@sahoda/billing', () => ({
  createPgLedgerPort: () => ({ pool }),
  loadBillingEnv: () => ({ databaseUrl: 'postgres://fake/never-connected' }),
}))

const store = await import('./store')
const sql = await import('./sql')

/** The last statement the code under test actually sent. */
function statementSent(): string {
  return pool.query.mock.calls.at(-1)?.[0] as string
}

function argsSent(): unknown[] {
  return pool.query.mock.calls.at(-1)?.[1] as unknown[]
}

beforeEach(() => {
  pool.query.mockReset()
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('readSettings', () => {
  it('puts each column in the field that means it, and the cap is not the window', async () => {
    pool.query.mockResolvedValue({
      rows: [{ autopilot_daily_cap: 3, autopilot_cancel_minutes: 45, weekly_budget_credits: 150 }],
    })

    const s = await store.readSettings('ws-1')

    // Named one by one. All three are `number | null`, so a single toEqual
    // would still pass if two were swapped in both the code and the fixture.
    expect(s.dailyCap).toBe(3)
    expect(s.cancelMinutes).toBe(45)
    expect(s.weeklyBudgetCredits).toBe(150)
    expect(statementSent()).toBe(sql.AUTOPILOT_SETTINGS_SQL)
    expect(argsSent()).toEqual(['ws-1'])
  })

  it('keeps null as null, because "never opened the Loop" is not "a cap of zero"', async () => {
    pool.query.mockResolvedValue({
      rows: [
        { autopilot_daily_cap: null, autopilot_cancel_minutes: null, weekly_budget_credits: null },
      ],
    })

    const s = await store.readSettings('ws-1')

    expect(s.dailyCap).toBeNull()
    expect(s.cancelMinutes).toBeNull()
    expect(s.weeklyBudgetCredits).toBeNull()
  })

  it('keeps a real zero as zero, which is a cap that publishes nothing', async () => {
    pool.query.mockResolvedValue({
      rows: [{ autopilot_daily_cap: 0, autopilot_cancel_minutes: 0, weekly_budget_credits: 0 }],
    })

    const s = await store.readSettings('ws-1')

    // `?? null` and `|| null` differ exactly here, and the difference is a cap
    // of nothing being read as no cap at all.
    expect(s.dailyCap).toBe(0)
    expect(s.cancelMinutes).toBe(0)
    expect(s.weeklyBudgetCredits).toBe(0)
  })

  it('answers all-null for a workspace with no row at all', async () => {
    pool.query.mockResolvedValue({ rows: [] })

    expect(await store.readSettings('ws-1')).toEqual({
      dailyCap: null,
      cancelMinutes: null,
      weeklyBudgetCredits: null,
    })
  })
})

describe('readDial', () => {
  it('answers undefined for a channel nobody armed, and never a default', async () => {
    pool.query.mockResolvedValue({ rows: [{ channel: 'x', level: 3 }] })

    const dial = await store.readDial('ws-1')

    expect(dial.get('x')).toBe(3)
    // The one that matters. A default here is how a product posts somewhere
    // the customer never agreed to; `decideOne` refuses undefined by name.
    expect(dial.get('linkedin')).toBeUndefined()
    expect(dial.size).toBe(1)
    expect(statementSent()).toBe(sql.DIAL_SQL)
  })

  it('keeps level 0 rather than dropping it, since 0 is a set level', async () => {
    pool.query.mockResolvedValue({
      rows: [
        { channel: 'x', level: 0 },
        { channel: 'gbp', level: 3 },
      ],
    })

    const dial = await store.readDial('ws-1')

    expect(dial.get('x')).toBe(0)
    expect(dial.get('gbp')).toBe(3)
  })

  it('is empty for a workspace that has never touched the dial', async () => {
    pool.query.mockResolvedValue({ rows: [] })
    expect((await store.readDial('ws-1')).size).toBe(0)
  })
})

describe('readPublishedToday', () => {
  it('returns the count the database gave', async () => {
    pool.query.mockResolvedValue({ rows: [{ n: 2 }] })
    expect(await store.readPublishedToday('ws-1')).toBe(2)
    expect(statementSent()).toBe(sql.PUBLISHED_TODAY_SQL)
  })

  it('returns 0 for a real zero rather than treating it as absent', async () => {
    pool.query.mockResolvedValue({ rows: [{ n: 0 }] })
    expect(await store.readPublishedToday('ws-1')).toBe(0)
  })
})

describe('armForPublish and cancelAnnouncement report whether anything happened', () => {
  it('arming is true when a row came back and false when none did', async () => {
    pool.query.mockResolvedValue({ rows: [{ id: 'p1' }] })
    expect(await store.armForPublish('ws-1', 'p1')).toBe(true)
    expect(statementSent()).toBe(sql.ARM_FOR_PUBLISH_SQL)

    pool.query.mockResolvedValue({ rows: [] })
    expect(await store.armForPublish('ws-1', 'p1')).toBe(false)
  })

  it('a cancel that changed nothing answers false, which a person needs to be told', async () => {
    // False means the post was already dispatched or already cancelled. Saying
    // "stopped" over a post that has gone out is the claim this product spends
    // its precision on not making.
    pool.query.mockResolvedValue({ rows: [] })
    expect(await store.cancelAnnouncement('ws-1', 'p1', 'v1')).toBe(false)

    pool.query.mockResolvedValue({ rows: [{ id: 'row' }] })
    expect(await store.cancelAnnouncement('ws-1', 'p1', 'v1')).toBe(true)
    expect(argsSent()).toEqual(['ws-1', 'p1', 'v1'])
  })
})

describe('readActiveBrain', () => {
  it('returns the payload when there is one', async () => {
    pool.query.mockResolvedValue({ rows: [{ payload: { field_meta: {} } }] })
    expect(await store.readActiveBrain('ws-1')).toEqual({ field_meta: {} })
  })

  it('returns null when there is no brain, which refuses rather than passes', async () => {
    // `brainClearsAutopilotFloor(null)` is false, so an absent brain refuses by
    // name. A read that came back empty and a business nobody has described are
    // the same thing as far as publishing unattended goes.
    pool.query.mockResolvedValue({ rows: [] })
    expect(await store.readActiveBrain('ws-1')).toBeNull()
  })
})

describe('readWorkspaceIds', () => {
  it('sends the statement it was handed, because the caller decides which workspaces', async () => {
    pool.query.mockResolvedValue({ rows: [{ workspace_id: 'a' }, { workspace_id: 'b' }] })

    const ids = await store.readWorkspaceIds(sql.AUTOPILOT_WORKSPACES_SQL, 50)

    expect(ids).toEqual(['a', 'b'])
    expect(statementSent()).toBe(sql.AUTOPILOT_WORKSPACES_SQL)
    expect(argsSent()).toEqual([50])
  })
})
