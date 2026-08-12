import { describe, expect, it } from 'vitest'
import type { ClassifierOutcome, GateCheckInput, GateClassifyInput } from '@sahoda/shared'

import { createPublishGate } from './gate'
import type { GateAuditEntry, GateContext } from './store'

const INPUT: GateCheckInput = {
  workspaceId: 'ws-from-the-payload',
  postId: 'post-1',
  variantId: 'variant-1',
  channel: 'x',
  text: 'Fresh samosas from 4pm today.',
  jobRunId: 'web:run-1',
}

/** A stored v1 Brand Brain, as `brand_memory.payload` actually holds one. */
const BRAIN = {
  voice: { banned_phrases: ['game-changer'] },
  taboo: { red_lines: ['never fake urgency'] },
}

interface Rig {
  gate: ReturnType<typeof createPublishGate>
  audits: GateAuditEntry[]
  classified: GateClassifyInput[]
}

function rig(
  over: {
    context?: GateContext | null
    loadThrows?: boolean
    auditThrows?: boolean
    outcome?: ClassifierOutcome
  } = {},
): Rig {
  const audits: GateAuditEntry[] = []
  const classified: GateClassifyInput[] = []

  const gate = createPublishGate({
    loadGateContext: async () => {
      if (over.loadThrows) throw new Error('pool exhausted')
      return over.context === undefined
        ? { workspaceId: 'ws-from-posts', brandVersion: 4, payload: BRAIN }
        : over.context
    },
    writeGateAudit: async (entry) => {
      if (over.auditThrows) throw new Error('insert refused')
      audits.push(entry)
    },
    classifier: {
      classify: async (input) => {
        classified.push(input)
        return over.outcome ?? { ran: true, model: 'test-model', findings: [] }
      },
    },
  })

  return { gate, audits, classified }
}

describe('createPublishGate — the four layers, composed', () => {
  it('passes a clean post and records what it checked', async () => {
    const r = rig()

    const verdict = await r.gate.check(INPUT)

    expect(verdict.decision).toBe('pass')
    expect(verdict.brandVersion).toBe(4)
    expect(verdict.ruleSet.packs.map((p) => p.id)).toEqual(['regime-_floor'])
  })

  it("puts the owner's own red line to the classifier, and their banned phrase to layer 2", async () => {
    const r = rig()

    await r.gate.check(INPUT)

    const asked = r.classified[0]?.rules.map((rule) => rule.id) ?? []
    // The prose red line has no phrases, so only layer 3 can rule on it.
    expect(asked).toContain('owner.red-line.1')
    // The banned-phrase rule did not fire on this text, so it is still open to
    // paraphrase and travels too. What must NOT happen is it being counted as
    // clear because layer 2 stayed quiet.
    expect(asked).toContain('owner.banned-phrases')
  })

  it('blocks on a banned phrase without spending a classifier call', async () => {
    const r = rig()

    const verdict = await r.gate.check({ ...INPUT, text: 'A real game-changer for your kitchen.' })

    expect(verdict.decision).toBe('block')
    expect(verdict.findings[0]).toMatchObject({
      ruleId: 'owner.banned-phrases',
      tier: 'owner',
      quote: 'game-changer',
    })
    expect(r.classified).toHaveLength(0)
  })
})

describe('createPublishGate — the workspace it trusts', () => {
  it('scopes the audit row to the workspace from `posts`, not the payload', async () => {
    // `payload.workspaceId` crosses a queue as ordinary data and nothing
    // re-checks it. The store re-derives from the post id; this proves the
    // derived value is the one that gets used.
    const r = rig()

    await r.gate.check(INPUT)

    expect(r.audits[0]?.workspaceId).toBe('ws-from-posts')
  })
})

describe('createPublishGate — nothing gets through on a failure', () => {
  it('holds when the brain could not be read', async () => {
    const r = rig({ loadThrows: true })

    const verdict = await r.gate.check(INPUT)

    expect(verdict.decision).toBe('hold')
    expect(verdict.holdReason).toBeTruthy()
  })

  it('holds when the post itself could not be found', async () => {
    const r = rig({ context: null })

    expect((await r.gate.check(INPUT)).decision).toBe('hold')
  })

  it.each([
    ['unavailable', { ran: false as const, state: 'unavailable' as const }],
    ['timeout', { ran: false as const, state: 'timeout' as const }],
    ['unparseable', { ran: false as const, state: 'unparseable' as const }],
    ['over-bounds', { ran: false as const, state: 'over-bounds' as const }],
  ])('holds when the classifier came back %s', async (_name, outcome) => {
    const r = rig({ outcome })

    expect((await r.gate.check(INPUT)).decision).toBe('hold')
  })

  it('still gates a workspace with no brain at all, against the floor pack', async () => {
    // A new workspace has written no red line. Refusing to check it would be the
    // gate opting out of the one tier that never depended on the owner.
    const r = rig({ context: { workspaceId: 'ws-from-posts', brandVersion: null, payload: null } })

    const verdict = await r.gate.check({
      ...INPUT,
      text: 'Guaranteed results or your money back.',
    })

    expect(verdict.decision).toBe('block')
    expect(verdict.findings[0]?.ruleId).toBe('floor.guaranteed-outcome')
    expect(verdict.brandVersion).toBeNull()
  })
})

describe('createPublishGate — the record', () => {
  it('writes one audit row per decision, passes included', async () => {
    // A trail that records only refusals cannot prove which rule set was in
    // force when something DID go out, which is the property doc 18 §8 names.
    const r = rig()

    await r.gate.check(INPUT)

    expect(r.audits).toHaveLength(1)
    expect(r.audits[0]).toMatchObject({
      actor: 'web:run-1',
      action: 'publish_gate.pass',
      target: { postId: 'post-1', variantId: 'variant-1', channel: 'x' },
      traceId: 'web:run-1',
    })
  })

  it('records the rule-set version, the brain version and the regime basis', async () => {
    const r = rig()

    await r.gate.check(INPUT)

    expect(r.audits[0]?.meta).toMatchObject({
      ruleSetVersion: 'regime-_floor@2026.08',
      brandVersion: 4,
      // `default`, not `declared` — nothing stores a regime today, and the row
      // must not claim the customer chose this.
      regime: { value: 'consumer', basis: 'default' },
      approver: null,
    })
  })

  it('turns a pass into a hold when the record could not be written', async () => {
    // A publish nobody can prove was checked is, to an auditor, a publish that
    // was not checked.
    const r = rig({ auditThrows: true })

    const verdict = await r.gate.check(INPUT)

    expect(verdict.decision).toBe('hold')
  })

  it('leaves a block a block when the record could not be written', async () => {
    // The post is not going out either way; downgrading an existing refusal buys
    // nothing and would lose the findings a person needs.
    const r = rig({ auditThrows: true })

    const verdict = await r.gate.check({ ...INPUT, text: 'A real game-changer.' })

    expect(verdict.decision).toBe('block')
    expect(verdict.findings).toHaveLength(1)
  })
})
