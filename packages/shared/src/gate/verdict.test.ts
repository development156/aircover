import { describe, expect, it } from 'vitest'

import { decideGate, type DecideGateInput } from './verdict'
import { resolveRuleSet } from './resolve-ruleset'
import type { GateFinding, Rule } from './rules'

const RULE: Rule = {
  id: 'owner.red-line.1',
  tier: 'owner',
  statement: 'Never fake urgency.',
  source: 'owner',
}

const HARD_FINDING: GateFinding = {
  ruleId: 'health.no-cure-claim',
  tier: 'mandated',
  statement: 'A treatment may not be advertised as a cure.',
  source: 'packs/regime/healthcare.md',
  layer: 'hard',
  quote: 'cure',
}

function input(over: Partial<DecideGateInput> = {}): DecideGateInput {
  return {
    text: 'Only two left, order before midnight.',
    ruleSet: resolveRuleSet({ regime: 'consumer', locale: 'IN', basis: 'default' }),
    hardFindings: [],
    unjudged: [RULE],
    classifier: { ran: true, model: 'test-model', findings: [] },
    brandVersion: 3,
    ...over,
  }
}

describe('decideGate — a certainty outranks a judgement', () => {
  it('blocks on a hard finding and does not spend a classifier call', () => {
    const verdict = decideGate(input({ hardFindings: [HARD_FINDING] }))
    expect(verdict.decision).toBe('block')
    expect(verdict.findings).toEqual([HARD_FINDING])
    expect(verdict.checks.classifier).toBe('skipped-already-blocked')
  })
})

describe('decideGate — ambiguity is not permission', () => {
  it.each(['unavailable', 'unparseable', 'timeout'] as const)(
    'holds when the classifier is %s',
    (state) => {
      const verdict = decideGate(input({ classifier: { ran: false, state } }))
      expect(verdict.decision).toBe('hold')
      expect(verdict.checks.classifier).toBe(state)
      expect(verdict.holdReason).toBeTruthy()
    },
  )

  it('holds when the classifier says it is unsure', () => {
    const verdict = decideGate(
      input({
        classifier: {
          ran: true,
          model: 'test-model',
          findings: [{ ruleId: RULE.id, verdict: 'unsure' }],
        },
      }),
    )
    expect(verdict.decision).toBe('hold')
    expect(verdict.findings.map((f) => f.ruleId)).toEqual([RULE.id])
  })

  it('holds — never drops — a finding about a rule that was never asked', () => {
    // Dropping is the fail-open move: it turns a model that answered
    // incoherently into a clean pass, and attributes nothing to anyone.
    const verdict = decideGate(
      input({
        classifier: {
          ran: true,
          model: 'test-model',
          findings: [{ ruleId: 'health.no-cure-claim', verdict: 'trips' }],
        },
      }),
    )
    expect(verdict.decision).toBe('hold')
    expect(verdict.findings).toEqual([])
  })

  it('passes only when a layer legitimately had nothing to ask', () => {
    const verdict = decideGate(
      input({ unjudged: [], classifier: { ran: false, state: 'skipped-no-rules' } }),
    )
    expect(verdict.decision).toBe('pass')
  })
})

describe('decideGate — blocking on a judgement', () => {
  it('blocks when the classifier is sure a rule trips', () => {
    const verdict = decideGate(
      input({
        classifier: {
          ran: true,
          model: 'test-model',
          findings: [
            {
              ruleId: RULE.id,
              verdict: 'trips',
              quote: 'order before midnight',
              rewrite: 'Say when the offer ends.',
            },
          ],
        },
      }),
    )
    expect(verdict.decision).toBe('block')
    expect(verdict.findings[0]).toMatchObject({
      ruleId: RULE.id,
      tier: 'owner',
      statement: 'Never fake urgency.',
      layer: 'classifier',
      quote: 'order before midnight',
      rewrite: 'Say when the offer ends.',
    })
    expect(verdict.classifierModel).toBe('test-model')
  })

  it('drops a quote the post does not contain rather than repeating it back', () => {
    // A paraphrased quote tells someone they wrote words they did not write,
    // and it is the first thing anyone disputes.
    const verdict = decideGate(
      input({
        classifier: {
          ran: true,
          model: 'test-model',
          findings: [{ ruleId: RULE.id, verdict: 'trips', quote: 'hurry, stock is running out' }],
        },
      }),
    )
    expect(verdict.decision).toBe('block')
    expect(verdict.findings[0]?.quote).toBeUndefined()
  })

  it('returns the quote as the writer cased it, not as the model echoed it', () => {
    const verdict = decideGate(
      input({
        text: 'Order Before Midnight.',
        classifier: {
          ran: true,
          model: 'test-model',
          findings: [{ ruleId: RULE.id, verdict: 'trips', quote: 'order before midnight' }],
        },
      }),
    )
    expect(verdict.findings[0]?.quote).toBe('Order Before Midnight')
  })

  it("prefers the rule's authored rewrite over the model's suggestion", () => {
    const authored: Rule = { ...RULE, rewrite: 'Authored rewrite.' }
    const verdict = decideGate(
      input({
        unjudged: [authored],
        classifier: {
          ran: true,
          model: 'test-model',
          findings: [{ ruleId: RULE.id, verdict: 'trips', rewrite: 'Model rewrite.' }],
        },
      }),
    )
    expect(verdict.findings[0]?.rewrite).toBe('Authored rewrite.')
  })

  it("keeps the model's rewrite where the rule has none — every owner red line", () => {
    const verdict = decideGate(
      input({
        classifier: {
          ran: true,
          model: 'test-model',
          findings: [{ ruleId: RULE.id, verdict: 'trips', rewrite: 'Name the real deadline.' }],
        },
      }),
    )
    expect(verdict.findings[0]?.rewrite).toBe('Name the real deadline.')
  })
})

describe('decideGate — the record it leaves', () => {
  it('passes a clean post and still reports what was checked', () => {
    const verdict = decideGate(input())
    expect(verdict.decision).toBe('pass')
    expect(verdict.checks).toEqual({ hard: 'ran', classifier: 'ran' })
    expect(verdict.brandVersion).toBe(3)
    expect(verdict.ruleSet.ruleSetVersion).toContain('regime-_floor@')
  })
})
