import { describe, expect, it } from 'vitest'

import { intakeFrom, ownerBannedPhrasesFrom, ownerRedLinesFrom } from './brain-rules'
import { packsFor, resolveRuleSet } from './resolve-ruleset'
import { REGIME_PACKS } from './packs'

describe('packsFor — code selects packs, never the model', () => {
  it('always includes the floor', () => {
    expect(packsFor(null, null).map((p) => p.id)).toEqual(['regime-_floor'])
  })

  it('adds the regime pack on top of the floor rather than replacing it', () => {
    // A jurisdiction adds obligations; it does not lift the ones underneath.
    expect(packsFor('healthcare', 'IN').map((p) => p.id)).toEqual([
      'regime-_floor',
      'regime-healthcare',
    ])
  })

  it('falls back to the floor for a regime with no pack', () => {
    expect(packsFor('aerospace', 'IN').map((p) => p.id)).toEqual(['regime-_floor'])
  })

  it('gives `consumer` the floor and nothing more, deliberately', () => {
    expect(packsFor('consumer', 'IN').map((p) => p.id)).toEqual(['regime-_floor'])
    expect(REGIME_PACKS['consumer']).toBeUndefined()
  })
})

describe('resolveRuleSet — the version it records', () => {
  it('composes every contributing pack and its version', () => {
    const set = resolveRuleSet({ regime: 'finance', locale: 'IN', basis: 'declared' })
    expect(set.ruleSetVersion).toBe('regime-_floor@2026.08+regime-finance@2026.08')
    expect(set.packs).toEqual([
      { id: 'regime-_floor', version: '2026.08' },
      { id: 'regime-finance', version: '2026.08' },
    ])
  })

  it('carries the basis through untouched', () => {
    // A default recorded as a declaration is the audit trail overstating what
    // it knew, which is the one thing it may not do.
    expect(resolveRuleSet({ regime: null, locale: null, basis: 'default' }).regime).toEqual({
      value: 'consumer',
      locale: 'IN',
      basis: 'default',
    })
  })
})

describe('resolveRuleSet — the owner tier', () => {
  it('turns each red line into a statement-only rule the classifier must judge', () => {
    const set = resolveRuleSet({
      regime: null,
      locale: null,
      basis: 'default',
      ownerRedLines: ['never fake urgency', '  ', 'never punch down'],
    })
    const owned = set.rules.filter((r) => r.tier === 'owner')
    expect(owned.map((r) => r.statement)).toEqual(['never fake urgency', 'never punch down'])
    // No phrases: nobody writes "never fake urgency" as a regex, and pretending
    // otherwise is how a gate goes green on the thing it exists to catch.
    expect(owned.every((r) => r.phrases === undefined)).toBe(true)
    expect(owned.every((r) => r.source === 'owner')).toBe(true)
  })

  it('turns banned phrases into the one owner rule layer 2 can act on', () => {
    const set = resolveRuleSet({
      regime: null,
      locale: null,
      basis: 'default',
      ownerBannedPhrases: ['game-changer', 'revolutionary'],
    })
    const banned = set.rules.find((r) => r.id === 'owner.banned-phrases')
    expect(banned?.phrases).toEqual(['game-changer', 'revolutionary'])
  })

  it('adds no owner rule at all when the brain has neither', () => {
    const set = resolveRuleSet({ regime: null, locale: null, basis: 'default' })
    expect(set.rules.filter((r) => r.tier === 'owner')).toEqual([])
  })
})

describe('what a workspace actually gets today', () => {
  /**
   * ── CHANGED LOUDLY, 2026-08-13 · onboarding now persists the intake ─────────
   *
   * This block used to record that the mandated tier was the floor pack and
   * NOTHING else, on every workspace that had ever existed, because onboarding
   * folded the regime into prose and kept no structure. That is no longer the
   * state of the product: `apps/web/src/lib/onboarding/to-stored-intake.ts`
   * writes `payload.intake`, and `saveBrandMemory` carries it across every later
   * version.
   *
   * The floor-only case below is kept and is still exactly right — it is now the
   * LEGACY read: a brain written before this existed, or one whose regime was
   * only ever assumed, carries no intake and gets the floor. That remains the
   * honest answer for those rows and must not be quietly upgraded.
   *
   * The OWNER tier was, and still is, the half that works on day one.
   */
  it('gives the floor, not the healthcare pack, to a brain that stores no regime', () => {
    const brain = { taboo: { red_lines: ['never promise a recovery time'] } }
    const stored = intakeFrom(brain)
    expect(stored).toEqual({ regime: null, locale: null, basis: 'default' })

    const set = resolveRuleSet({
      ...stored,
      ownerRedLines: ownerRedLinesFrom(brain),
      ownerBannedPhrases: ownerBannedPhrasesFrom(brain),
    })
    expect(set.packs.map((p) => p.id)).toEqual(['regime-_floor'])
    expect(set.rules.some((r) => r.id === 'health.no-cure-claim')).toBe(false)
    // But their own rule is in force.
    expect(set.rules.some((r) => r.statement === 'never promise a recovery time')).toBe(true)
  })

  it('selects the healthcare pack the moment an intake IS stored', () => {
    const brain = { intake: { regime: 'healthcare', locale: 'IN', basis: 'declared' } }
    const set = resolveRuleSet(intakeFrom(brain))
    expect(set.regime).toEqual({ value: 'healthcare', locale: 'IN', basis: 'declared' })
    expect(set.rules.some((r) => r.id === 'health.no-cure-claim')).toBe(true)
  })

  it('honours a DERIVED regime — the pack applies, the attribution does not', () => {
    // Onboarding writes `derived` when it read the trade out of the customer's
    // own sentence rather than being told. The pack must still apply: the rule
    // is about what may be claimed, not about who typed it. But `describeRuleSource`
    // may only say "the trade you told us you are in" under `declared`, and a
    // clinic we merely recognised never told us anything.
    const brain = { intake: { regime: 'healthcare', locale: 'IN', basis: 'derived' } }
    const set = resolveRuleSet(intakeFrom(brain))

    expect(set.regime.basis).toBe('derived')
    expect(set.rules.some((r) => r.id === 'health.no-cure-claim')).toBe(true)
  })

  it('reads an intake with no basis as derived, never as declared', () => {
    // A regime IS stored, so its pack applies and `default` ("this applies to
    // every business") would misdescribe a healthcare rule. But nothing in the
    // payload says the customer picked it, and the stronger claim needs saying.
    expect(intakeFrom({ intake: { regime: 'finance' } }).basis).toBe('derived')
  })
})

describe('brain-rules — tolerant reads', () => {
  it('reads red lines and banned phrases independently, so one bad section costs only itself', () => {
    const brain = { taboo: { red_lines: 'none' }, voice: { banned_phrases: ['hype'] } }
    expect(ownerRedLinesFrom(brain)).toEqual([])
    expect(ownerBannedPhrasesFrom(brain)).toEqual(['hype'])
  })

  it.each([null, undefined, 42, 'a string', {}])('returns nothing for %s', (payload) => {
    expect(ownerRedLinesFrom(payload)).toEqual([])
    expect(intakeFrom(payload).basis).toBe('default')
  })

  it('does not upgrade the basis on a locale alone', () => {
    expect(intakeFrom({ intake: { locale: 'IN' } })).toEqual({
      regime: null,
      locale: null,
      basis: 'default',
    })
  })
})
