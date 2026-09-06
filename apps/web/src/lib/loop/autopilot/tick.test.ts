import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { GateVerdict } from '@sahoda/shared'

vi.mock('server-only', () => ({}))
vi.mock('./store', () => ({
  readSettings: vi.fn(),
  readDial: vi.fn(),
  readActiveBrain: vi.fn(),
  readPublishedToday: vi.fn(),
  readCandidateRows: vi.fn(),
  readPendingAnnouncements: vi.fn(),
  readWeekSpend: vi.fn(async () => 0),
  writeDecision: vi.fn(async () => 'row-id'),
  armForPublish: vi.fn(async () => true),
  cancelAnnouncement: vi.fn(async () => true),
}))
vi.mock('@/lib/cron/loop-enabled', () => ({ loopCronEnabled: vi.fn(() => true) }))
// The real assembler, with a price that is not zero. `publishCostCredits()`
// is 0 today (verdicts.ts says why), so the budget guardrail can only be
// forced from here by giving the candidate a cost.
let costCredits = 10
vi.mock('./verdicts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./verdicts')>()
  return {
    ...actual,
    toAutopilotCandidate: vi.fn((row, verdict) => ({
      ...actual.toAutopilotCandidate(row, verdict),
      costCredits,
    })),
  }
})

import { loopCronEnabled } from '@/lib/cron/loop-enabled'
import { isoWeekOf } from '@/lib/loop/iso-week'
import * as store from './store'
import { runWorkspaceAutopilotTick } from './tick'

/**
 * ── WHAT THIS FILE CANNOT SEE ────────────────────────────────────────────────
 * The store is mocked, so this proves the WIRING: which reads feed which part
 * of the decision, and that a workspace with nothing to decide writes nothing.
 * It does not prove any statement is valid SQL — the pglite suite owns that —
 * and nothing here reaches a platform.
 */

const CONFIRMED = {
  field_meta: {
    'hook.core_promise': { confirmed: true },
    'customer_persona.primary_pain_point': { confirmed: true },
    'voice.descriptor': { confirmed: true },
    'taboo.red_lines': { confirmed: true },
  },
}

const PASS: GateVerdict = {
  decision: 'pass',
  findings: [],
  ruleSet: { rules: [], version: 1 } as unknown as GateVerdict['ruleSet'],
  brandVersion: null,
  checks: { hard: 'ran', classifier: 'ran' },
}

function candidateRow(over: Partial<store.CandidateRow> = {}): store.CandidateRow {
  return {
    postId: 'post-1',
    variantId: 'variant-1',
    channel: 'x',
    body: 'a short post',
    lastError: null,
    accountId: '44445555666677778888aaaa',
    briefId: 'brief-1',
    cycleId: 'cycle-1',
    ...over,
  }
}

function world(over: Partial<Record<string, unknown>> = {}) {
  vi.mocked(store.readSettings).mockResolvedValue({
    dailyCap: 3,
    cancelMinutes: 30,
    weeklyBudgetCredits: 150,
    paused: false,
    ...(over.settings as object),
  })
  vi.mocked(store.readDial).mockResolvedValue(
    (over.dial as Map<never, number>) ?? new Map([['x', 3]] as never),
  )
  vi.mocked(store.readActiveBrain).mockResolvedValue('brain' in over ? over.brain : CONFIRMED)
  vi.mocked(store.readPublishedToday).mockResolvedValue((over.publishedToday as number) ?? 0)
  vi.mocked(store.readCandidateRows).mockResolvedValue(
    (over.rows as store.CandidateRow[]) ?? [candidateRow()],
  )
  vi.mocked(store.readPendingAnnouncements).mockResolvedValue((over.pending as never[]) ?? [])
  vi.mocked(store.readWeekSpend).mockResolvedValue((over.weekSpend as number) ?? 0)
}

const deps = { workspaceId: 'ws-1', gateFor: async () => PASS }

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(store.writeDecision).mockResolvedValue('row-id')
  vi.mocked(store.armForPublish).mockResolvedValue(true)
  vi.mocked(loopCronEnabled).mockReturnValue(true)
})

describe('a workspace that has not opened the Loop', () => {
  it('decides nothing and writes nothing', async () => {
    world({ settings: { dailyCap: null, cancelMinutes: null, weeklyBudgetCredits: null } })
    const report = await runWorkspaceAutopilotTick(deps)
    expect(report).toMatchObject({ announced: 0, refused: 0, dispatched: 0 })
    expect(store.writeDecision).not.toHaveBeenCalled()
  })

  it('a workspace with nothing to decide writes no rows either', async () => {
    world({ rows: [], pending: [] })
    await runWorkspaceAutopilotTick(deps)
    expect(store.writeDecision).not.toHaveBeenCalled()
  })
})

describe('the brain is re-read every tick, not inferred from the dial', () => {
  it('announces when the four fields are confirmed', async () => {
    world()
    const report = await runWorkspaceAutopilotTick(deps)
    expect(report.announced).toBe(1)
  })

  it('REFUSES when the brain has since been unconfirmed, though the dial is still 3', async () => {
    // The defect this read exists for. The trigger only checks the floor when
    // the dial is WRITTEN; a person who unconfirms a field afterwards does not
    // move the dial, and withdrawing that agreement is how somebody says
    // "stop writing that about us".
    world({ brain: { field_meta: { 'hook.core_promise': { confirmed: true } } } })
    const report = await runWorkspaceAutopilotTick(deps)
    expect(report.announced).toBe(0)
    expect(report.refusalsByReason).toEqual({ BRAIN_BELOW_FLOOR: 1 })
  })

  it('REFUSES when there is no brain at all', async () => {
    world({ brain: null })
    const report = await runWorkspaceAutopilotTick(deps)
    expect(report.refusalsByReason).toEqual({ BRAIN_BELOW_FLOOR: 1 })
  })
})

describe('the gate verdict reaches the decision', () => {
  it('a held gate refuses by name', async () => {
    world()
    const held: GateVerdict = { ...PASS, decision: 'hold' }
    const report = await runWorkspaceAutopilotTick({ ...deps, gateFor: async () => held })
    expect(report.refusalsByReason).toEqual({ REFUSAL_GATE: 1 })
  })
})

describe('dispatch hands the post to the existing sweep', () => {
  const due = [
    {
      postId: 'due-1',
      variantId: 'v-9',
      channel: 'x' as const,
      accountId: '44445555666677778888aaaa',
      dispatchAfter: new Date('2020-01-01T00:00:00.000Z'),
    },
  ]

  it('arms the post rather than publishing it', async () => {
    world({ rows: [], pending: due })
    const report = await runWorkspaceAutopilotTick(deps)
    expect(report.dispatched).toBe(1)
    expect(store.armForPublish).toHaveBeenCalledWith('ws-1', 'due-1')
  })

  it('publishes NOTHING while the Loop kill switch is off', async () => {
    world({ rows: [], pending: due })
    vi.mocked(loopCronEnabled).mockReturnValue(false)
    const report = await runWorkspaceAutopilotTick(deps)
    expect(store.armForPublish).not.toHaveBeenCalled()
    expect(report.cancelled).toBe(1)
    expect(report.refused).toBe(0)
    // The env flag is Sahoda's switch, so the cancellation is Sahoda's row.
    expect(store.writeDecision).toHaveBeenCalledWith(
      expect.objectContaining({ postId: 'due-1', decision: 'cancelled' }),
    )
    expect(store.cancelAnnouncement).not.toHaveBeenCalled()
  })

  it('a refused arming is not an error and does not stop the tick', async () => {
    world({ rows: [], pending: due })
    vi.mocked(store.armForPublish).mockResolvedValue(false)
    const report = await runWorkspaceAutopilotTick(deps)
    expect(report.publishFailed).toBe(0)
    expect(report.dispatched).toBe(1)
  })
})

describe('nothing is announced that cannot be sent', () => {
  const gate = vi.fn(async () => PASS)

  it('announces NOTHING while the deploy-wide flag is off, and does not even gate', async () => {
    // MEASURED 2026-09-02: the env flag was consulted only at dispatch time, so
    // with SAHODA_AUTOPILOT_ENABLED on and SAHODA_LOOP_CRON_MODE off every
    // eligible post was announced ("going out at 10:15") and cancelled by
    // Sahoda one window later, for every post, with nothing naming the flag.
    world()
    vi.mocked(loopCronEnabled).mockReturnValue(false)
    const report = await runWorkspaceAutopilotTick({ ...deps, gateFor: gate })
    expect(report.announced).toBe(0)
    expect(store.writeDecision).not.toHaveBeenCalledWith(
      expect.objectContaining({ decision: 'announced' }),
    )
    // The gate's third layer is a model call. A stopped Loop pays for none.
    expect(gate).not.toHaveBeenCalled()
  })

  it('announces NOTHING while the customer has paused the Loop', async () => {
    world({ settings: { paused: true } })
    const report = await runWorkspaceAutopilotTick(deps)
    expect(report.announced).toBe(0)
    expect(store.writeDecision).not.toHaveBeenCalled()
  })
})

describe("the customer's Stop reaches an announcement already made", () => {
  const due = [
    {
      postId: 'due-1',
      variantId: 'v-9',
      channel: 'x' as const,
      accountId: '44445555666677778888aaaa',
      dispatchAfter: new Date('2020-01-01T00:00:00.000Z'),
    },
  ]

  it('cancels the pending announcement AS THE PERSON and arms nothing', async () => {
    // MEASURED 2026-09-02: `loop_settings.paused` was never read here. A person
    // who pressed Stop inside the window saw the post reverted to draft, and
    // the next tick found the announcement still pending, re-armed the draft
    // (ARM_FOR_PUBLISH_SQL admits 'draft') and the sweep published it.
    world({ rows: [], pending: due, settings: { paused: true } })
    const report = await runWorkspaceAutopilotTick(deps)
    expect(store.armForPublish).not.toHaveBeenCalled()
    expect(report.dispatched).toBe(0)
    expect(report.cancelled).toBe(1)
    // Their stop, their row: the same statement the per-post Stop button
    // uses, which writes actor 'person'. Not a Sahoda cancellation.
    expect(store.cancelAnnouncement).toHaveBeenCalledWith('ws-1', 'due-1', 'v-9')
    expect(store.writeDecision).not.toHaveBeenCalledWith(
      expect.objectContaining({ decision: 'cancelled' }),
    )
  })
})

describe("the week's budget is what is LEFT, not what was set", () => {
  // MEASURED 2026-09-06: the tick passed the whole `weekly_budget_credits` as
  // `weeklyBudgetRemaining`, where decide.ts documents "credits left". A week
  // that had spent 145 of its 150 still offered every candidate 150.
  const now = new Date('2026-09-09T10:00:00.000Z') // a Wednesday, ISO week 37

  it('reads the spend of the ISO week that contains now', async () => {
    world()
    await runWorkspaceAutopilotTick({ ...deps, now })
    expect(store.readWeekSpend).toHaveBeenCalledWith('ws-1', isoWeekOf(now))
    expect(isoWeekOf(now)).toEqual({ isoYear: 2026, isoWeek: 37 })
  })

  it('announces while the budget still covers the post', async () => {
    world({ weekSpend: 140 }) // 150 - 140 = 10 left, and the post costs 10
    const report = await runWorkspaceAutopilotTick({ ...deps, now })
    expect(report.announced).toBe(1)
  })

  it("REFUSES by name once this week's cycles have spent the budget down", async () => {
    world({ weekSpend: 145 }) // 5 left, the post costs 10
    const report = await runWorkspaceAutopilotTick({ ...deps, now })
    expect(report.announced).toBe(0)
    expect(report.refusalsByReason).toEqual({ WEEKLY_BUDGET: 1 })
  })

  it('clamps at zero: a post that costs nothing is not refused by a week spent past its budget', async () => {
    // Without the clamp the remainder is -350 and `0 > -350` refuses a post
    // that would not spend a credit. Nothing left is 0, not a negative number.
    costCredits = 0
    try {
      world({ weekSpend: 500 })
      const report = await runWorkspaceAutopilotTick({ ...deps, now })
      expect(report.announced).toBe(1)
    } finally {
      costCredits = 10
    }
  })
})
