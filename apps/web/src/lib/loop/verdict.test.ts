import { describe, expect, it } from 'vitest'
import { toChannelSet } from '@sahoda/shared'

import { explain, remedy } from '@/lib/loop/eligibility'
import type { LoopSnapshot } from '@/lib/loop/read'
import { loopVerdict } from '@/lib/loop/verdict'

/**
 * THE SENTENCE THE /loop SCREEN SHOWS, PER STATE.
 *
 * Every case below asserts the SENTENCE, not the reason code. A code can be
 * renamed by a refactor with every assertion still green; the sentence is the
 * thing that would be wrong on somebody's screen. This repo has the scar:
 * three of four refusal tests once passed with the guard deleted because they
 * asserted `ok === false`.
 *
 * The five states are the ones production is actually in. MEASURED 2026-08-28
 * across the five workspaces that have ever opened the Loop: 3 with no channel,
 * 2 paused, 0 eligible.
 */

// Tuesday of ISO week 35, 2026 — the week the cron would plan.
const NOW = new Date('2026-08-25T12:00:00Z')

function snapshot(over: Partial<LoopSnapshot> = {}): LoopSnapshot {
  return {
    enabled: true,
    paused: false,
    weeklyBudgetCredits: 150,
    availableCredits: 500,
    brain: { resolved: true, confirmed: 15, total: 15 },
    dial: new Map(),
    connected: toChannelSet(['x']),
    lapsed: toChannelSet([]),
    cycle: null,
    briefs: [],
    learnings: [],
    ...over,
  } as LoopSnapshot
}

describe('loopVerdict — what the screen tells a workspace', () => {
  it('says it will plan, and names the channel, when everything is in place', () => {
    const v = loopVerdict(snapshot(), NOW)
    expect(v.eligible).toBe(true)
    expect(explain(v)).toBe('Sahoda will plan your week for X.')
    expect(remedy(v)).toBeNull()
  })

  it('tells a workspace that never opened the Loop to turn it on', () => {
    const v = loopVerdict(snapshot({ enabled: false }), NOW)
    expect(explain(v)).toBe('Turn the Loop on and Sahoda will plan your week every Sunday.')
    expect(remedy(v)).toEqual({ href: '#loop-controls', label: 'Turn the Loop on' })
  })

  it('tells a paused workspace to resume, and does not call it un-enabled', () => {
    const v = loopVerdict(snapshot({ paused: true }), NOW)
    expect(explain(v)).toContain('paused')
    expect(explain(v)).not.toContain('Turn the Loop on and')
  })

  it('tells a workspace with no channel to connect one', () => {
    const v = loopVerdict(snapshot({ connected: toChannelSet([]) }), NOW)
    expect(explain(v)).toBe('Connect a channel first — Sahoda has nowhere to plan for.')
    expect(remedy(v)).toEqual({ href: '/connections', label: 'Connect a channel' })
  })

  /**
   * The remedy that must never be swapped for the one above. Somebody whose
   * Instagram authorisation expired HAS connected Instagram, and telling them
   * to connect it is the screen making a claim about their account that is not
   * true. Production held 4 expired connections against 2 active ones on
   * 2026-08-22, which is what made this branch worth having.
   */
  it('tells a workspace whose channel lapsed to RECONNECT, never to connect', () => {
    const v = loopVerdict(
      snapshot({ connected: toChannelSet([]), lapsed: toChannelSet(['instagram']) }),
      NOW,
    )
    expect(explain(v)).toContain('reconnect')
    expect(explain(v)).not.toContain('Connect a channel first')
    expect(remedy(v)).toEqual({ href: '/connections', label: 'Reconnect it' })
  })

  /**
   * The blocking half of the brain. `packages/mesh` injects the brand prefix
   * from the active `brand_memory` row and returns null without one, so a
   * workspace with no brain is planned for at the full price with a generic
   * prompt: a week of posts about a business Sahoda knows nothing about.
   */
  it('tells a workspace with no Brand Brain to build one, before mentioning channels', () => {
    const v = loopVerdict(
      snapshot({
        brain: { resolved: false, confirmed: 0, total: 15 },
        connected: toChannelSet([]),
      }),
      NOW,
    )
    expect(explain(v)).toBe(
      'Sahoda does not know your business yet. Build your Brand Brain and it can plan a week that sounds like you.',
    )
    expect(remedy(v)).toEqual({ href: '/brain', label: 'Build your Brand Brain' })
  })

  /**
   * The ADVISORY half, and it must not become a refusal. MEASURED 2026-08-28:
   * four of the five production workspaces that have opened the Loop have a
   * resolved brain with zero confirmed fields. Refusing them would refuse
   * almost the whole fleet for a state that is legitimate at L1, where a person
   * reads every draft before it reaches anyone.
   */
  it('plans for a workspace whose brain is unconfirmed, and says so on the same sentence', () => {
    const v = loopVerdict(snapshot({ brain: { resolved: true, confirmed: 0, total: 15 } }), NOW)
    expect(v.eligible).toBe(true)
    expect(explain(v)).toBe(
      'Sahoda will plan your week for X. Nothing in your Brand Brain is confirmed yet, so it will write in a voice it guessed at.',
    )
  })

  it('says nothing about the brain once a single field is confirmed', () => {
    const v = loopVerdict(snapshot({ brain: { resolved: true, confirmed: 1, total: 15 } }), NOW)
    expect(explain(v)).toBe('Sahoda will plan your week for X.')
  })

  it('tells a workspace short of credits what a week costs and what it holds', () => {
    const v = loopVerdict(snapshot({ availableCredits: 3 }), NOW)
    expect(explain(v)).toContain('3 credits')
    expect(remedy(v)).toEqual({ href: '/wallet', label: 'Top up' })
  })

  /**
   * A cycle already open for THIS week is an answer, not a problem — and the
   * remedy points at the cycle further down the same page, because the sentence
   * says "open it" and a link to nowhere would make that sentence false.
   */
  it('says the week is already planned when a cycle is open for it', () => {
    const v = loopVerdict(
      snapshot({
        cycle: { id: 'c1', isoYear: 2026, isoWeek: 35, status: 'planning' } as never,
      }),
      NOW,
    )
    expect(explain(v)).toContain('already planned week 35 of 2026')
    expect(remedy(v)).toEqual({ href: '#loop-current', label: 'Review this week' })
  })

  /**
   * The bug this guard exists for: the snapshot carries the MOST RECENT cycle
   * whatever week it belongs to. Reading it without comparing the week would
   * tell a workspace its week was planned because last week's was.
   */
  it('does not call this week planned because LAST week was', () => {
    const v = loopVerdict(
      snapshot({
        cycle: { id: 'c0', isoYear: 2026, isoWeek: 34, status: 'reported' } as never,
      }),
      NOW,
    )
    expect(v.eligible).toBe(true)
    expect(explain(v)).toBe('Sahoda will plan your week for X.')
  })

  /** A cancelled cycle is not an open one, and must not block the next week. */
  it('does not call this week planned when the cycle for it was cancelled', () => {
    const v = loopVerdict(
      snapshot({
        cycle: { id: 'c2', isoYear: 2026, isoWeek: 35, status: 'cancelled' } as never,
      }),
      NOW,
    )
    expect(v.eligible).toBe(true)
  })

  /**
   * Order matters and is asserted, because a workspace is usually in several
   * states at once and only ONE sentence reaches the screen. Paused-and-broke
   * must say paused: buying credits would not start their Loop.
   */
  it('reports paused rather than insufficient credits when both are true', () => {
    const v = loopVerdict(snapshot({ paused: true, availableCredits: 0 }), NOW)
    expect(explain(v)).toContain('paused')
    expect(explain(v)).not.toContain('top up')
  })
})
