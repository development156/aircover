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
  writeDecision: vi.fn(async () => 'row-id'),
  armForPublish: vi.fn(async () => true),
}))
vi.mock('@/lib/cron/loop-enabled', () => ({ loopCronEnabled: vi.fn(() => true) }))

import { loopCronEnabled } from '@/lib/cron/loop-enabled'
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
  })

  it('a refused arming is not an error and does not stop the tick', async () => {
    world({ rows: [], pending: due })
    vi.mocked(store.armForPublish).mockResolvedValue(false)
    const report = await runWorkspaceAutopilotTick(deps)
    expect(report.publishFailed).toBe(0)
    expect(report.dispatched).toBe(1)
  })
})
