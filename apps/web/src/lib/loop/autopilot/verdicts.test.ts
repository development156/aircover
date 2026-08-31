import { describe, expect, it } from 'vitest'
import type { GateVerdict } from '@sahoda/shared'

import { CONSTRAINTS } from '@sahoda/shared'
import type { CandidateRow } from './store'
import { fitsChannel, gateFlagged, publishCostCredits, toAutopilotCandidate } from './verdicts'

/**
 * ── WHAT THIS FILE CANNOT SEE ────────────────────────────────────────────────
 * It proves the MAPPING from verdicts to a candidate. It does not run the
 * refusal gate — that is a model call and lives elsewhere — so a gate that
 * returned the wrong verdict would map faithfully and be wrong. What is
 * adjudicated here is the one judgement this module owns: which gate decisions
 * count as permission.
 */

function verdict(decision: GateVerdict['decision']): GateVerdict {
  return {
    decision,
    findings: [],
    ruleSet: { rules: [], version: 1 } as unknown as GateVerdict['ruleSet'],
    brandVersion: null,
    checks: { hard: 'ran', classifier: 'ran' },
  }
}

function row(over: Partial<CandidateRow> = {}): CandidateRow {
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

describe('gateFlagged — only a pass is permission', () => {
  it('a pass is not flagged', () => {
    expect(gateFlagged(verdict('pass'))).toBe(false)
  })

  it('a block is flagged', () => {
    expect(gateFlagged(verdict('block'))).toBe(true)
  })

  it('a HOLD is flagged — ambiguity is not permission', () => {
    // The decision this module exists to make. At L2 a hold reaches a person
    // who reads the draft; at L3 there is nobody, so "we could not tell" must
    // never become "go ahead". A gate that was unavailable did not pass.
    expect(gateFlagged(verdict('hold'))).toBe(true)
  })
})

describe('fitsChannel — the Constraint Engine, unmodified', () => {
  it('accepts a body inside the channel limit', () => {
    expect(fitsChannel({ channel: 'x', body: 'well within' })).toBe(true)
  })

  it('REFUSES a body over the channel limit', () => {
    const tooLong = 'a'.repeat(CONSTRAINTS.x.maxChars + 1)
    expect(fitsChannel({ channel: 'x', body: tooLong })).toBe(false)
  })

  it('accepts a body at exactly the limit, so the boundary is not off by one', () => {
    const exact = 'a'.repeat(CONSTRAINTS.x.maxChars)
    expect(fitsChannel({ channel: 'x', body: exact })).toBe(true)
  })

  it('uses the limit of the channel it was given, not one channel for all', () => {
    // gbp allows far more than x. A body between the two must be judged
    // differently per channel, and a single hard-coded limit would not.
    const between = 'a'.repeat(CONSTRAINTS.x.maxChars + 50)
    expect(CONSTRAINTS.gbp.maxChars).toBeGreaterThan(CONSTRAINTS.x.maxChars + 50)
    expect(fitsChannel({ channel: 'x', body: between })).toBe(false)
    expect(fitsChannel({ channel: 'gbp', body: between })).toBe(true)
  })
})

describe('publishCostCredits', () => {
  it('is zero, because nothing is charged at publish', () => {
    // Stated as an assertion rather than a comment so that adding a price
    // without revisiting the WEEKLY_BUDGET reasoning turns this red. The
    // credits for a Loop post are spent at plan and create time, behind the
    // cost preview a person approved; charging again here would bill twice.
    expect(publishCostCredits()).toBe(0)
  })
})

describe('toAutopilotCandidate', () => {
  it('carries every identifier straight through, inventing none', () => {
    const c = toAutopilotCandidate(row(), verdict('pass'))
    expect(c).toMatchObject({
      postId: 'post-1',
      variantId: 'variant-1',
      channel: 'x',
      accountId: '44445555666677778888aaaa',
      briefId: 'brief-1',
      cycleId: 'cycle-1',
    })
  })

  it('a null brief and cycle stay null rather than becoming a fake id', () => {
    const c = toAutopilotCandidate(row({ briefId: null, cycleId: null }), verdict('pass'))
    expect(c.briefId).toBeNull()
    expect(c.cycleId).toBeNull()
  })

  it('a passing gate and a fitting body produce a candidate nothing has refused yet', () => {
    const c = toAutopilotCandidate(row(), verdict('pass'))
    expect(c.gateFlagged).toBe(false)
    expect(c.fitsChannel).toBe(true)
  })

  it('a held gate reaches the candidate as flagged', () => {
    expect(toAutopilotCandidate(row(), verdict('hold')).gateFlagged).toBe(true)
  })

  it('an over-length body reaches the candidate as not fitting', () => {
    const c = toAutopilotCandidate(
      row({ body: 'a'.repeat(CONSTRAINTS.x.maxChars + 1) }),
      verdict('pass'),
    )
    expect(c.fitsChannel).toBe(false)
  })
})
