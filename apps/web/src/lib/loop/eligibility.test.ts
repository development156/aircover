import { describe, it, expect } from 'vitest'

import { assess, explain, type LoopFacts } from './eligibility'

/**
 * EVERY REFUSAL IS ASSERTED BY ITS SENTENCE, NOT BY FALSINESS.
 *
 * `expect(result.eligible).toBe(false)` is satisfied by all six causes and by a
 * thrown exception the caller swallowed. A peer measured THREE OF FOUR refusal
 * tests in this repo passing WITH THE GUARD DELETED, because the code under test
 * threw and an outer catch turned the throw into the same `ok: false` the test
 * was looking for.
 *
 * So each test here holds the exact sentence a customer would read. Deleting the
 * branch that produces it makes the test fail on a STRING MISMATCH — which is a
 * different failure from a crash, and the difference is the whole point.
 */

const WEEK = { isoYear: 2026, isoWeek: 35 }

/** A workspace that would be planned for. Each test breaks exactly one thing. */
function eligibleFacts(over: Partial<LoopFacts> = {}): LoopFacts {
  return {
    workspaceId: 'ws-1',
    settings: { paused: false, weeklyBudgetCredits: 150 },
    connections: [
      { platform: 'instagram', status: 'active' },
      { platform: 'linkedin', status: 'active' },
    ],
    availableCredits: 1260,
    // A resolved brain with every field confirmed. Each test below breaks one
    // thing, and the brain is not the thing unless the test says it is.
    brain: { resolved: true, confirmed: 15, total: 15 },
    planningWeek: WEEK,
    openCycle: null,
    dial: [
      { channel: 'instagram', level: 1 },
      { channel: 'linkedin', level: 1 },
    ],
    ...over,
  }
}

describe('the Loop says why it will not plan', () => {
  it('plans for a workspace with a live channel, credits and no cycle yet', () => {
    const v = assess(eligibleFacts())
    expect(v.eligible).toBe(true)
    expect(explain(v)).toBe('Sahoda will plan your week for Instagram and LinkedIn.')
  })

  it('says the Loop was never turned on when there is no settings row', () => {
    const v = assess(eligibleFacts({ settings: null }))
    expect(explain(v)).toBe('Turn the Loop on and Sahoda will plan your week every Sunday.')
    expect(v.eligible === false && v.reason).toBe('never_enabled')
  })

  it('distinguishes paused from never enabled', () => {
    const v = assess(eligibleFacts({ settings: { paused: true, weeklyBudgetCredits: 150 } }))
    expect(explain(v)).toBe('The Loop is paused — resume it and Sahoda will plan your next week.')
    expect(v.eligible === false && v.reason).toBe('paused')
  })

  it('says connect when a workspace never had a channel', () => {
    const v = assess(eligibleFacts({ connections: [] }))
    expect(explain(v)).toBe('Connect a channel first — Sahoda has nowhere to plan for.')
    expect(v.eligible === false && v.reason).toBe('no_channel')
  })

  it('says RECONNECT, naming the channel, when one lapsed', () => {
    const v = assess(eligibleFacts({ connections: [{ platform: 'instagram', status: 'expired' }] }))
    expect(explain(v)).toBe(
      'Your Instagram connection has lapsed — reconnect it and Sahoda has somewhere to plan for again.',
    )
    expect(v.eligible === false && v.reason).toBe('channel_lapsed')
  })

  it('names every lapsed channel, and pluralises', () => {
    const v = assess(
      eligibleFacts({
        connections: [
          { platform: 'instagram', status: 'expired' },
          { platform: 'x', status: 'revoked' },
        ],
      }),
    )
    expect(explain(v)).toBe(
      'Your Instagram and X connections have lapsed — reconnect them and Sahoda has somewhere to plan for again.',
    )
  })

  it('says the week is already planned rather than repeating the charge', () => {
    const v = assess(eligibleFacts({ openCycle: { id: 'cyc-9', status: 'planning' } }))
    expect(explain(v)).toBe(
      "Sahoda already planned week 35 of 2026 — open it to review this week's briefs.",
    )
    expect(v.eligible === false && v.reason).toBe('already_planned')
  })

  it('says how many credits are short, with both numbers', () => {
    const v = assess(eligibleFacts({ availableCredits: 4 }))
    expect(explain(v)).toBe(
      'Planning a week costs 20 credits and you have 4 credits — top up and Sahoda will plan your next week.',
    )
    expect(v.eligible === false && v.reason).toBe('insufficient_credits')
  })

  it('is eligible at exactly the price, and not one credit below', () => {
    expect(assess(eligibleFacts({ availableCredits: 20 })).eligible).toBe(true)
    expect(assess(eligibleFacts({ availableCredits: 19 })).eligible).toBe(false)
  })

  // ── ORDER: a workspace in two states reports the one to fix first ──────────
  it('reports paused, not no_channel, when both are true', () => {
    const v = assess(
      eligibleFacts({ settings: { paused: true, weeklyBudgetCredits: 150 }, connections: [] }),
    )
    expect(v.eligible === false && v.reason).toBe('paused')
  })

  it('reports already_planned, not insufficient_credits, when both are true', () => {
    const v = assess(
      eligibleFacts({ openCycle: { id: 'cyc-9', status: 'planning' }, availableCredits: 0 }),
    )
    expect(v.eligible === false && v.reason).toBe('already_planned')
    expect(explain(v)).toContain('already planned')
  })

  // ── L0 IS AN ADVISORY, NOT A REFUSAL ──────────────────────────────────────
  it('still plans when every channel is at L0, and says the week will only suggest', () => {
    const v = assess(
      eligibleFacts({
        dial: [
          { channel: 'instagram', level: 0 },
          { channel: 'linkedin', level: 0 },
        ],
      }),
    )
    expect(v.eligible).toBe(true)
    expect(v.eligible && v.advisory.suggestOnly).toBe(true)
    expect(explain(v)).toBe(
      'Sahoda will plan your week for Instagram and LinkedIn, as suggestions — every channel is set to suggest only.',
    )
  })

  it('takes the LOWEST level across channels, so one L0 governs', () => {
    const v = assess(
      eligibleFacts({
        dial: [
          { channel: 'instagram', level: 2 },
          { channel: 'linkedin', level: 0 },
        ],
      }),
    )
    expect(v.eligible && v.advisory.governingLevel).toBe(0)
  })

  // ── THE SHAPE OF THE MEASURED FLEET ───────────────────────────────────────
  // Both real production workspaces, reproduced. This is the answer to
  // "eligible: 1, planned: 0" that nothing used to give.
  it('explains both production workspaces measured on 2026-08-23', () => {
    const loopOnNoChannels = assess(
      eligibleFacts({ connections: [], availableCredits: 0, workspaceId: 'ws-on' }),
    )
    expect(explain(loopOnNoChannels)).toBe(
      'Connect a channel first — Sahoda has nowhere to plan for.',
    )

    const pausedWithChannels = assess(
      eligibleFacts({
        settings: { paused: true, weeklyBudgetCredits: 150 },
        workspaceId: 'ws-off',
      }),
    )
    expect(explain(pausedWithChannels)).toBe(
      'The Loop is paused — resume it and Sahoda will plan your next week.',
    )
  })

  // ── A CHANNEL THE LOOP CANNOT PLAN FOR IS NOT A CHANNEL ───────────────────
  it('ignores a connected platform that is not one of the four', () => {
    const v = assess(eligibleFacts({ connections: [{ platform: 'tiktok', status: 'active' }] }))
    expect(explain(v)).toBe('Connect a channel first — Sahoda has nowhere to plan for.')
  })

  it('never returns eligible without naming at least one channel', () => {
    const v = assess(eligibleFacts())
    expect(v.eligible && v.channels.length).toBeGreaterThan(0)
  })
})
