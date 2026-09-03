import { describe, expect, it } from 'vitest'

import { AUTOPILOT_REFUSALS } from '@/lib/loop/autopilot-refusals'
import { autopilotStatus, type AutopilotHistoryRow } from './history-copy'

/**
 * ── WHAT THIS FILE CANNOT SEE ────────────────────────────────────────────────
 * It checks the CLAIM each sentence makes, not its wording. Every assertion
 * below is either about a forbidden claim or about the machine-readable state,
 * so the prose can be rewritten freely and the guarantees survive — which is
 * the rule this repository already applies to `lib/inbox/emptiness.ts`.
 */

const NOW = new Date('2026-08-29T10:00:00.000Z')

function row(over: Partial<AutopilotHistoryRow> = {}): AutopilotHistoryRow {
  return {
    decision: 'announced',
    refusalReason: null,
    dispatchAfter: new Date('2026-08-29T10:30:00.000Z'),
    createdAt: new Date('2026-08-29T09:30:00.000Z'),
    actor: 'autopilot',
    ...over,
  }
}

describe('the claim that must never be made', () => {
  it('a dispatched post is NOT described as published', () => {
    // The migration's own header: 'dispatched' does not mean published. This
    // table watched the post leave the room; it did not watch it arrive.
    const s = autopilotStatus([row({ decision: 'dispatched', dispatchAfter: null })], NOW)
    expect(s.sentence).not.toMatch(/\bpublished\b|\bposted\b|\blive\b/i)
    expect(s.state).toBe('handed-over')
  })

  it('a post whose window closed is NOT described as sent', () => {
    // It has not gone out — the sweep has not reached it — and the stop still
    // works. Saying otherwise sends somebody away from a button that works.
    const s = autopilotStatus([row({ dispatchAfter: new Date('2026-08-29T09:00:00.000Z') })], NOW)
    expect(s.sentence).not.toMatch(/\bwent out\b|\bsent\b(?!\s+it\s+yet)/i)
    expect(s.state).toBe('due')
    expect(s.stoppable).toBe(true)
  })
})

describe('stoppable is true exactly while stopping would do something', () => {
  it('inside the window', () => {
    expect(autopilotStatus([row()], NOW).stoppable).toBe(true)
  })

  it('past the window but not yet handed over', () => {
    const s = autopilotStatus([row({ dispatchAfter: new Date('2020-01-01T00:00:00.000Z') })], NOW)
    expect(s.stoppable).toBe(true)
  })

  it('NOT once handed over', () => {
    expect(autopilotStatus([row({ decision: 'dispatched' })], NOW).stoppable).toBe(false)
  })

  it('NOT once stopped', () => {
    expect(autopilotStatus([row({ decision: 'cancelled' })], NOW).stoppable).toBe(false)
  })

  it('NOT once refused', () => {
    const s = autopilotStatus(
      [row({ decision: 'refused', refusalReason: AUTOPILOT_REFUSALS.DAILY_CAP })],
      NOW,
    )
    expect(s.stoppable).toBe(false)
  })
})

describe('the whole history decides, not the newest row alone', () => {
  it('an announcement followed by a cancellation is stopped, not waiting', () => {
    const s = autopilotStatus(
      [
        row({ createdAt: new Date('2026-08-29T09:30:00.000Z') }),
        row({
          decision: 'cancelled',
          actor: 'person',
          dispatchAfter: null,
          createdAt: new Date('2026-08-29T09:40:00.000Z'),
        }),
      ],
      NOW,
    )
    expect(s.state).toBe('stopped')
    expect(s.stoppable).toBe(false)
  })

  it('rows arriving out of order are ordered by time, not by position', () => {
    // The scan may return any order. Reading the last element of the array
    // rather than the newest by clock would call a stopped post pending.
    const announced = row({ createdAt: new Date('2026-08-29T09:30:00.000Z') })
    const cancelled = row({
      decision: 'cancelled',
      dispatchAfter: null,
      createdAt: new Date('2026-08-29T09:40:00.000Z'),
    })
    expect(autopilotStatus([cancelled, announced], NOW).state).toBe('stopped')
  })
})

describe('who stopped it', () => {
  it('says the PERSON did when the person did', () => {
    const s = autopilotStatus([row({ decision: 'cancelled', actor: 'person' })], NOW)
    expect(s.sentence).toMatch(/^you\b/i)
  })

  it('does NOT say the person did when autopilot did', () => {
    // The kill switch and a customer pressing stop are different events, and
    // telling somebody they stopped a post they never touched is a small lie
    // that makes the whole log untrustworthy.
    const s = autopilotStatus([row({ decision: 'cancelled', actor: 'autopilot' })], NOW)
    expect(s.sentence).not.toMatch(/^you\b/i)
    expect(s.sentence).toMatch(/sahoda/i)
  })
})

describe('refusals', () => {
  it('uses the guardrail’s own sentence', () => {
    const s = autopilotStatus(
      [row({ decision: 'refused', refusalReason: AUTOPILOT_REFUSALS.BRAIN_BELOW_FLOOR })],
      NOW,
    )
    expect(s.sentence).toMatch(/does not know enough/i)
  })

  it('does not invent a cause for a name it does not recognise', () => {
    // A refusal we cannot explain is still a refusal. Guessing at one would be
    // worse than admitting the gap.
    const s = autopilotStatus([row({ decision: 'refused', refusalReason: 'FUTURE_NAME' })], NOW)
    expect(s.state).toBe('refused')
    expect(s.sentence).toMatch(/not one this screen knows/i)
  })
})

describe('nothing at all', () => {
  it('says autopilot has not looked, which is not the same as a refusal', () => {
    const s = autopilotStatus([], NOW)
    expect(s.state).toBe('nothing')
    expect(s.stoppable).toBe(false)
    // "Autopilot refused this" and "autopilot never considered this" are
    // different facts, and this product keeps such pairs apart.
    expect(s.sentence).not.toMatch(/\brefused\b|\bstopped\b/i)
  })
})
