import { describe, expect, it } from 'vitest'

import { describeRuleSource, readGateRefusal } from './gate-refusal'

const blocked = {
  code: 'GATE_BLOCKED',
  classification: 'permanent',
  message: 'Stopped before publishing: this breaks a required rule.',
  gate: {
    decision: 'block',
    ruleSetVersion: 'regime-_floor@2026.08+regime-healthcare@2026.08',
    brandVersion: 3,
    regime: { value: 'healthcare', basis: 'declared' },
    findings: [
      {
        ruleId: 'health.no-cure-claim',
        tier: 'mandated',
        statement: 'A treatment may not be advertised as a cure.',
        quote: 'a permanent cure',
        rewrite: 'Describe what the treatment does and who it suits.',
      },
    ],
  },
}

describe('readGateRefusal', () => {
  it('reads the refusal a person needs to act on', () => {
    expect(readGateRefusal(blocked)).toEqual({
      decision: 'block',
      regimeBasis: 'declared',
      holdReason: null,
      findings: [
        {
          ruleId: 'health.no-cure-claim',
          tier: 'mandated',
          statement: 'A treatment may not be advertised as a cure.',
          quote: 'a permanent cure',
          rewrite: 'Describe what the treatment does and who it suits.',
        },
      ],
    })
  })

  it('returns null for a failure that was not the gate', () => {
    expect(readGateRefusal({ code: 'RATE_LIMITED', message: 'slow down' })).toBeNull()
  })

  it.each([null, undefined, 'a string', 42, [], { gate: 'yes' }, { gate: { decision: 'maybe' } }])(
    'returns null rather than throwing on %s',
    (raw) => {
      expect(readGateRefusal(raw)).toBeNull()
    },
  )

  it('drops a finding with no rule or no words rather than rendering an empty bullet', () => {
    // An empty bullet tells someone their post was refused and shows them nothing.
    const refusal = readGateRefusal({
      gate: { decision: 'block', findings: [{ ruleId: 'a' }, { statement: 'b' }, 42] },
    })
    expect(refusal?.findings).toEqual([])
  })

  it('reads an unrecognised regime basis as the weakest one', () => {
    // An unreadable basis must never upgrade into "your regulator said so".
    const refusal = readGateRefusal({
      gate: { decision: 'block', regime: { basis: 'certainly' }, findings: [] },
    })
    expect(refusal?.regimeBasis).toBe('default')
  })

  it('reads an unrecognised tier as the owner tier', () => {
    // `owner` is the weaker claim: it says the customer set this rule, which is
    // always safer than telling them a regulator did.
    const refusal = readGateRefusal({
      gate: {
        decision: 'block',
        findings: [{ ruleId: 'x', tier: 'statutory', statement: 'No.' }],
      },
    })
    expect(refusal?.findings[0]?.tier).toBe('owner')
  })

  it('bounds a very long rule so it cannot become a wall of text', () => {
    const refusal = readGateRefusal({
      gate: { decision: 'block', findings: [{ ruleId: 'x', statement: 'y'.repeat(1000) }] },
    })
    expect(refusal?.findings[0]?.statement.length).toBe(240)
  })

  it('carries the hold reason when nobody could decide', () => {
    const refusal = readGateRefusal({
      gate: {
        decision: 'hold',
        findings: [],
        holdReason: 'The wording check did not finish in time.',
      },
    })
    expect(refusal).toMatchObject({
      decision: 'hold',
      holdReason: 'The wording check did not finish in time.',
    })
  })
})

describe('describeRuleSource — inherited or theirs', () => {
  const mandated = {
    ruleId: 'x',
    tier: 'mandated' as const,
    statement: 's',
    quote: null,
    rewrite: null,
  }
  const owner = { ...mandated, tier: 'owner' as const }

  it("names the customer's trade only when they actually declared one", () => {
    expect(describeRuleSource(mandated, 'declared').detail).toContain('you told us')
  })

  it.each(['derived', 'default'] as const)(
    'says a %s-regime rule applies to everyone, not to their industry',
    (basis) => {
      // Nobody told us what they do. Attributing the refusal to their regulator
      // would be the product inventing one.
      const detail = describeRuleSource(mandated, basis).detail
      expect(detail).toContain('every business')
      expect(detail).not.toContain('you told us')
    },
  )

  it('points an owner rule back at the place they can change it', () => {
    expect(describeRuleSource(owner, 'declared')).toMatchObject({
      label: 'Your rule',
    })
    expect(describeRuleSource(owner, 'declared').detail).toContain('Brand Brain')
  })
})
