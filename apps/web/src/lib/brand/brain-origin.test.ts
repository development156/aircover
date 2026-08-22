import { describe, expect, test } from 'vitest'

import { brainOrigin, NO_PER_FIELD_EVIDENCE } from './brain-origin'

/**
 * The three values `public.resolve_brand_memory` validates, plus the two ways a
 * row can arrive carrying none.
 */
const STORED = ['resolved', 'manual', 'system'] as const

describe('brainOrigin', () => {
  test.each(STORED)('%s maps to its own kind', (source) => {
    expect(brainOrigin(source).kind).toBe(source)
  })

  /**
   * THE ONE THAT MATTERS. `saveBrandMemory` states the contract: a model
   * fallback "persists with `source='system'` and a visible notice — never
   * presented as a genuine resolve". A sample brain renders identically to a
   * real one, so a person could confirm their way through fifteen fields about
   * a business that is not theirs. This is the flag that stops it.
   */
  test('a system fallback is marked as a sample and nothing else is', () => {
    expect(brainOrigin('system').isSample).toBe(true)
    for (const other of ['resolved', 'manual', null, undefined, 'anything']) {
      expect(brainOrigin(other).isSample).toBe(false)
    }
  })

  test('the sample line says it is not about this business, and says what to do', () => {
    const { line } = brainOrigin('system')
    expect(line).toMatch(/not answers about your business/i)
    expect(line).toMatch(/re-run the resolve/i)
  })

  /**
   * An unrecorded source must not be guessed into the common case. Reporting
   * "resolved" for a row that says nothing would be inventing provenance on the
   * one screen whose entire subject is refusing to do that.
   */
  test.each([[null], [undefined], [''], ['legacy'], ['RESOLVED']])(
    'an unrecorded or unknown source reads as not recorded: %s',
    (source) => {
      const origin = brainOrigin(source as string | null | undefined)
      expect(origin.kind).toBe('unknown')
      expect(origin.label).toMatch(/not recorded/i)
      // It must not assert a resolve happened, nor that one did not.
      expect(origin.line).not.toMatch(/\bresolved by\b/i)
    },
  )

  test('every arm carries a label and a line', () => {
    for (const source of [...STORED, null]) {
      const origin = brainOrigin(source)
      expect(origin.label.length).toBeGreaterThan(0)
      expect(origin.line.length).toBeGreaterThan(0)
    }
  })

  test('no two arms share a line', () => {
    const lines = [...STORED, null].map((s) => brainOrigin(s).line)
    expect(new Set(lines).size).toBe(lines.length)
  })
})

describe('NO_PER_FIELD_EVIDENCE', () => {
  /**
   * The sentence is the finding, so it has to actually make the claim. It must
   * say Sahoda CANNOT show per-field evidence — not merely that it does not, and
   * not that it might later.
   */
  test('states that per-field evidence does not exist', () => {
    expect(NO_PER_FIELD_EVIDENCE).toMatch(/cannot show which sentence produced which field/i)
    expect(NO_PER_FIELD_EVIDENCE).toMatch(/will not invent/i)
  })

  test('does not promise the evidence is coming', () => {
    expect(NO_PER_FIELD_EVIDENCE).not.toMatch(/coming soon|for now|yet\b|soon\b/i)
  })
})

/**
 * THE COLLISION BETWEEN AN ACCEPTED LEARNING AND A MODEL FALLBACK.
 *
 * Measured against production 2026-08-22 with a throwaway workspace: an active
 * brain at `source='resolved'`, one pending `memory_events` row, one call to
 * `public.resolve_memory_event(..., 'accepted')` — and the active row came back
 * `{"version":2,"source":"system"}`. `brainOrigin('system')` then renders "A
 * sample, not your brand… These are not answers about your business", with an
 * `alert` role and the danger palette, about a brain the owner had just improved.
 *
 * The Loop's accept button (`app/actions/loop-controls.ts`) reaches that RPC, so
 * this was live rather than hypothetical.
 */
describe('an accepted learning is not a model fallback', () => {
  test('reads as a real update, not a sample, when a learning claims the version', () => {
    const origin = brainOrigin('system', { appliedFromLearning: true })
    expect(origin.kind).toBe('learned')
    expect(origin.isSample).toBe(false)
    expect(origin.label).toBe('Updated by a learning you accepted')
  })

  test('still says SAMPLE when nothing claims the version — the fallback is unchanged', () => {
    const origin = brainOrigin('system', { appliedFromLearning: false })
    expect(origin.kind).toBe('system')
    expect(origin.isSample).toBe(true)
    expect(origin.line).toContain('not answers about your business')
  })

  test('defaults to the cautious answer when the caller says nothing', () => {
    // A read that failed, an older caller, a component that forgot the prop —
    // every one of them must land on the WARNING and never on the reassurance.
    expect(brainOrigin('system').isSample).toBe(true)
    expect(brainOrigin('system', {}).isSample).toBe(true)
  })

  test('cannot be used to talk down a warning on any other source', () => {
    // The flag is consulted for 'system' alone. A caller passing it everywhere
    // must not be able to relabel a resolved or unrecorded brain.
    for (const source of ['resolved', 'manual', null, 'nonsense']) {
      expect(brainOrigin(source, { appliedFromLearning: true }).kind).not.toBe('learned')
    }
  })

  test('says what actually happened, without claiming anyone confirmed anything', () => {
    const { line } = brainOrigin('system', { appliedFromLearning: true })
    expect(line).toContain('a change you approved')
    // The ring counts CONFIRMED fields. Accepting one learning does not confirm
    // the other fourteen, and this sentence must not imply that it did.
    expect(line).toContain('still Sahoda')
  })
})
