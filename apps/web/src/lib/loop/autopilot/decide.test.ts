import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { AUTOPILOT_REFUSALS } from '@/lib/loop/autopilot-refusals'
import {
  AUTOPILOT_CANCEL_FLOOR_MINUTES,
  AUTOPILOT_LEVEL,
  decideAutopilotBatch,
  decideOne,
  dispatchAfter,
  type AutopilotCandidate,
  type AutopilotWorld,
} from './decide'

/**
 * ── WHAT THIS FILE CANNOT SEE ────────────────────────────────────────────────
 * It proves the DECISION and nothing else. It does not prove that a row is
 * written, that the publish path is reached, or that the account belongs to the
 * workspace — `assert_account_for_scheduled_post` owns that last one and is
 * verified against production separately. A dispatcher that decided perfectly
 * and wrote nothing would pass every test here.
 */

const CONFIRMED_BRAIN = {
  field_meta: {
    'hook.core_promise': { confirmed: true },
    'customer_persona.primary_pain_point': { confirmed: true },
    'voice.descriptor': { confirmed: true },
    'taboo.red_lines': { confirmed: true },
  },
}

function candidate(over: Partial<AutopilotCandidate> = {}): AutopilotCandidate {
  return {
    postId: 'post-1',
    variantId: 'variant-1',
    channel: 'x',
    accountId: 'acct-1',
    briefId: null,
    cycleId: null,
    gateFlagged: false,
    fitsChannel: true,
    costCredits: 10,
    ...over,
  }
}

function world(over: Partial<AutopilotWorld> = {}): AutopilotWorld {
  return {
    now: new Date('2026-08-29T09:00:00.000Z'),
    levelFor: () => AUTOPILOT_LEVEL,
    brainPayload: CONFIRMED_BRAIN,
    dailyCap: 3,
    publishedToday: 0,
    cancelMinutes: 30,
    weeklyBudgetRemaining: 1000,
    ...over,
  }
}

describe('decideOne — the happy path', () => {
  it('announces a post on an armed channel, with a window to stop it', () => {
    const decision = decideOne(candidate(), world())
    expect(decision.kind).toBe('announce')
    if (decision.kind !== 'announce') throw new Error('unreachable')
    expect(decision.dispatchAfter.toISOString()).toBe('2026-08-29T09:30:00.000Z')
  })

  it('never announces without a window — every announcement is stoppable', () => {
    const decision = decideOne(candidate(), world())
    if (decision.kind !== 'announce') throw new Error('expected an announcement')
    expect(decision.dispatchAfter.getTime()).toBeGreaterThan(world().now.getTime())
  })
})

describe('decideOne — each guardrail refuses by name', () => {
  it('REFUSES a channel the customer never armed', () => {
    const decision = decideOne(candidate(), world({ levelFor: () => 2 }))
    expect(decision).toMatchObject({
      kind: 'refuse',
      reason: AUTOPILOT_REFUSALS.NOT_AUTOPILOT_CHANNEL,
    })
  })

  it('REFUSES a channel with no dial row at all, rather than defaulting it on', () => {
    const decision = decideOne(candidate(), world({ levelFor: () => undefined }))
    expect(decision).toMatchObject({
      kind: 'refuse',
      reason: AUTOPILOT_REFUSALS.NOT_AUTOPILOT_CHANNEL,
    })
  })

  it('REFUSES a body the refusal gate flagged', () => {
    const decision = decideOne(candidate({ gateFlagged: true }), world())
    expect(decision).toMatchObject({ kind: 'refuse', reason: AUTOPILOT_REFUSALS.REFUSAL_GATE })
  })

  it('REFUSES a post the Constraint Engine says does not fit the channel', () => {
    const decision = decideOne(candidate({ fitsChannel: false }), world())
    expect(decision).toMatchObject({ kind: 'refuse', reason: AUTOPILOT_REFUSALS.CONSTRAINT_ENGINE })
  })

  it('REFUSES when the Brand Brain is below the floor', () => {
    const decision = decideOne(candidate(), world({ brainPayload: null }))
    expect(decision).toMatchObject({ kind: 'refuse', reason: AUTOPILOT_REFUSALS.BRAIN_BELOW_FLOOR })
  })

  it('REFUSES when only the red lines are unconfirmed, the rest agreed', () => {
    const brain = {
      field_meta: { ...CONFIRMED_BRAIN.field_meta, 'taboo.red_lines': { confirmed: false } },
    }
    const decision = decideOne(candidate(), world({ brainPayload: brain }))
    expect(decision).toMatchObject({ kind: 'refuse', reason: AUTOPILOT_REFUSALS.BRAIN_BELOW_FLOOR })
  })

  it("REFUSES when today's cap is already reached", () => {
    const decision = decideOne(candidate(), world({ dailyCap: 3, publishedToday: 3 }))
    expect(decision).toMatchObject({ kind: 'refuse', reason: AUTOPILOT_REFUSALS.DAILY_CAP })
  })

  it('REFUSES every post when the cap is zero, which is how a customer pauses autopilot', () => {
    const decision = decideOne(candidate(), world({ dailyCap: 0, publishedToday: 0 }))
    expect(decision).toMatchObject({ kind: 'refuse', reason: AUTOPILOT_REFUSALS.DAILY_CAP })
  })

  it('REFUSES a post that costs more than the week has left', () => {
    const decision = decideOne(candidate({ costCredits: 11 }), world({ weeklyBudgetRemaining: 10 }))
    expect(decision).toMatchObject({ kind: 'refuse', reason: AUTOPILOT_REFUSALS.WEEKLY_BUDGET })
  })

  it('ALLOWS a post that spends the week down to exactly zero', () => {
    const decision = decideOne(candidate({ costCredits: 10 }), world({ weeklyBudgetRemaining: 10 }))
    expect(decision.kind).toBe('announce')
  })
})

describe('the order of the guardrails — the most permanent reason is the one recorded', () => {
  it('names the gate, not the cap, when a flagged post arrives on a full day', () => {
    const decision = decideOne(
      candidate({ gateFlagged: true }),
      world({ dailyCap: 1, publishedToday: 1 }),
    )
    expect(decision).toMatchObject({ kind: 'refuse', reason: AUTOPILOT_REFUSALS.REFUSAL_GATE })
  })

  it('names the gate, not the budget, when a flagged post arrives with no credits', () => {
    const decision = decideOne(
      candidate({ gateFlagged: true }),
      world({ weeklyBudgetRemaining: 0 }),
    )
    expect(decision).toMatchObject({ kind: 'refuse', reason: AUTOPILOT_REFUSALS.REFUSAL_GATE })
  })

  it('names the unarmed channel before anything about the post, so L2 raises no alarm', () => {
    const decision = decideOne(
      candidate({ gateFlagged: true, fitsChannel: false }),
      world({ levelFor: () => 1, brainPayload: null }),
    )
    expect(decision).toMatchObject({
      kind: 'refuse',
      reason: AUTOPILOT_REFUSALS.NOT_AUTOPILOT_CHANNEL,
    })
  })

  it('names the brain, not the cap, because a person can clear the brain today', () => {
    const decision = decideOne(
      candidate(),
      world({ brainPayload: null, dailyCap: 1, publishedToday: 1 }),
    )
    expect(decision).toMatchObject({ kind: 'refuse', reason: AUTOPILOT_REFUSALS.BRAIN_BELOW_FLOOR })
  })
})

describe('the cancel window', () => {
  it('is the setting, in minutes, after now', () => {
    expect(dispatchAfter(new Date('2026-08-29T09:00:00.000Z'), 45).toISOString()).toBe(
      '2026-08-29T09:45:00.000Z',
    )
  })

  it('CLAMPS a zero to the floor — autopilot with no cancel is a different product', () => {
    const at = dispatchAfter(new Date('2026-08-29T09:00:00.000Z'), 0)
    expect(at.toISOString()).toBe('2026-08-29T09:05:00.000Z')
  })

  it('CLAMPS a negative window too, which would otherwise dispatch in the past', () => {
    const at = dispatchAfter(new Date('2026-08-29T09:00:00.000Z'), -600)
    expect(at.getTime()).toBeGreaterThan(new Date('2026-08-29T09:00:00.000Z').getTime())
  })

  it('the floor matches the CHECK in the migration, so the two cannot drift', () => {
    const sql = readFileSync(
      resolve(
        process.cwd(),
        '../../packages/db/supabase/migrations/20260828120000_loop_autopilot_l3.sql',
      ),
      'utf8',
    )
    expect(sql).toContain('autopilot_cancel_minutes >= 5')
    expect(AUTOPILOT_CANCEL_FLOOR_MINUTES).toBe(5)
  })
})

describe('decideAutopilotBatch — a cap is only a cap across a batch', () => {
  const five = Array.from({ length: 5 }, (_, i) =>
    candidate({ postId: `post-${i}`, variantId: `variant-${i}` }),
  )

  it('announces exactly the cap and refuses the rest by name', () => {
    const decisions = decideAutopilotBatch(five, world({ dailyCap: 3, publishedToday: 0 }))
    expect(decisions.filter((d) => d.kind === 'announce')).toHaveLength(3)
    const refused = decisions.filter((d) => d.kind === 'refuse')
    expect(refused).toHaveLength(2)
    expect(
      refused.every((d) => d.kind === 'refuse' && d.reason === AUTOPILOT_REFUSALS.DAILY_CAP),
    ).toBe(true)
  })

  it('counts what is already published today against the same cap', () => {
    const decisions = decideAutopilotBatch(five, world({ dailyCap: 3, publishedToday: 2 }))
    expect(decisions.filter((d) => d.kind === 'announce')).toHaveLength(1)
  })

  it('spends the week down as it announces, and stops when it runs out', () => {
    const decisions = decideAutopilotBatch(five, world({ dailyCap: 20, weeklyBudgetRemaining: 25 }))
    expect(decisions.filter((d) => d.kind === 'announce')).toHaveLength(2)
    const refused = decisions.filter((d) => d.kind === 'refuse')
    expect(
      refused.every((d) => d.kind === 'refuse' && d.reason === AUTOPILOT_REFUSALS.WEEKLY_BUDGET),
    ).toBe(true)
  })

  it('a refusal costs nothing — a flagged post does not spend the day’s allowance', () => {
    const decisions = decideAutopilotBatch(
      [
        candidate({ postId: 'a', gateFlagged: true }),
        candidate({ postId: 'b' }),
        candidate({ postId: 'c' }),
      ],
      world({ dailyCap: 2 }),
    )
    expect(decisions.filter((d) => d.kind === 'announce')).toHaveLength(2)
    expect(decisions[0]).toMatchObject({ reason: AUTOPILOT_REFUSALS.REFUSAL_GATE })
  })

  it('returns one decision per candidate, in order, so the log can be written by index', () => {
    const decisions = decideAutopilotBatch(five, world())
    expect(decisions).toHaveLength(5)
    expect(decisions.map((d) => d.candidate.postId)).toEqual([
      'post-0',
      'post-1',
      'post-2',
      'post-3',
      'post-4',
    ])
  })

  it('announces nothing at all from an empty tick', () => {
    expect(decideAutopilotBatch([], world())).toEqual([])
  })
})
