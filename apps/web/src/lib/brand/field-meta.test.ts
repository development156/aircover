import { describe, expect, test } from 'vitest'
import { DEMO_FALLBACK_PAYLOAD, type BrandFieldMetaMap } from '@sahoda/shared'

import { nextFieldMeta, type PreviousBrain } from './field-meta'
import { BRAIN_FIELDS } from './fields'
import { writeLeaf } from './leaf'
import { provenanceOf, stateOf } from './provenance'

const BASE = DEMO_FALLBACK_PAYLOAD

function previous(payload = BASE, meta?: BrandFieldMetaMap): PreviousBrain {
  return { payload, meta }
}

function confirmedMeta(...paths: string[]): BrandFieldMetaMap {
  const map: BrandFieldMetaMap = {}
  for (const path of paths) map[path] = { kind: 'asked', confirmed: true, source: 'owner' }
  return map
}

describe('nextFieldMeta — what a write claims', () => {
  test('a first resolve with no predecessor claims nothing', () => {
    const meta = nextFieldMeta(null, BASE)
    expect(Object.keys(meta)).toHaveLength(BRAIN_FIELDS.length)
    expect(Object.values(meta).every((entry) => entry.confirmed === false)).toBe(true)
  })

  test('every registered field gets an entry, and alignment gets none', () => {
    const meta = nextFieldMeta(null, BASE)
    for (const field of BRAIN_FIELDS) expect(meta[field.path]).toBeDefined()
    expect(meta['alignment.signal_lock']).toBeUndefined()
  })

  test('a confirmed field records the owner as its source', () => {
    const meta = nextFieldMeta(previous(), BASE, ['voice.descriptor'])
    expect(meta['voice.descriptor']).toEqual({
      kind: 'negotiated',
      confirmed: true,
      source: 'owner',
    })
  })

  test('an unconfirmed field records the model as its source', () => {
    const meta = nextFieldMeta(previous(), BASE)
    expect(meta['voice.descriptor']?.source).toBe('model:brand_guidelines')
  })

  test('the metaKind of each field comes from the registry, not the caller', () => {
    const meta = nextFieldMeta(null, BASE)
    expect(meta['voice.descriptor']?.kind).toBe('negotiated')
    expect(meta['hook.core_promise']?.kind).toBe('asked')
  })
})

/**
 * The two rules, which used to be emergent properties of diffing the version
 * history and are now the whole content of this function.
 */
describe('what a regenerate does to a confirmed field', () => {
  const prior = confirmedMeta('hook.primary_emotion')

  test('a regenerate that AGREES leaves the confirmation standing', () => {
    // The model returned the same sentence the user had confirmed. Nothing
    // changed, so nothing is demoted — agreement is not grounds to un-confirm.
    const meta = nextFieldMeta(previous(BASE, prior), BASE)
    expect(meta['hook.primary_emotion']?.confirmed).toBe(true)
    expect(meta['hook.primary_emotion']?.source).toBe('owner')
  })

  test('a regenerate that OVERWRITES reverts the field to a guess', () => {
    // What is on screen is now the model's sentence, not the user's. The ring
    // must stop counting it.
    const overwritten = writeLeaf(BASE, 'hook.primary_emotion', 'Relief and quiet pride')
    const meta = nextFieldMeta(previous(BASE, prior), overwritten)
    expect(meta['hook.primary_emotion']?.confirmed).toBe(false)
    expect(meta['hook.primary_emotion']?.source).toBe('model:brand_guidelines')
  })

  test('a field the user never confirmed stays a guess either way', () => {
    const meta = nextFieldMeta(previous(BASE, prior), BASE)
    expect(meta['voice.descriptor']?.confirmed).toBe(false)
  })

  test('a reordered list is different text, so it reverts', () => {
    // Order carries meaning in every list here, so reordering is a real change
    // and the confirmation does not survive it.
    const priorList = confirmedMeta('taboo.red_lines')
    const reordered = writeLeaf(BASE, 'taboo.red_lines', [...BASE.taboo.red_lines].reverse())
    const meta = nextFieldMeta(previous(BASE, priorList), reordered)
    expect(meta['taboo.red_lines']?.confirmed).toBe(false)
  })

  test('confirmations survive a regenerate that leaves OTHER fields changed', () => {
    const changed = writeLeaf(BASE, 'voice.descriptor', 'Brisk and plain')
    const meta = nextFieldMeta(previous(BASE, prior), changed)
    expect(meta['hook.primary_emotion']?.confirmed).toBe(true)
    expect(meta['voice.descriptor']?.confirmed).toBe(false)
  })
})

describe('confirmPaths is the complete statement of what a write confirms', () => {
  test('naming a path confirms it even when the text is identical', () => {
    // The interaction the version-diffing design could not express: a person
    // reads a guess, agrees with it, and says so without retyping it.
    const meta = nextFieldMeta(previous(), BASE, ['hook.core_promise'])
    expect(meta['hook.core_promise']?.confirmed).toBe(true)
  })

  test('a changed field is NOT confirmed unless it is named', () => {
    // A fresh resolve differs from the previous brain in nearly every field. If
    // "changed" implied authorship, pressing Finish would confirm the lot.
    const changed = writeLeaf(BASE, 'voice.descriptor', 'Brisk and plain')
    const meta = nextFieldMeta(previous(), changed)
    expect(meta['voice.descriptor']?.confirmed).toBe(false)
  })

  test('with no predecessor, only named paths are confirmed', () => {
    const meta = nextFieldMeta(null, BASE, ['voice.descriptor'])
    expect(meta['voice.descriptor']?.confirmed).toBe(true)
    expect(meta['hook.core_promise']?.confirmed).toBe(false)
  })

  test('an unknown path cannot invent a field', () => {
    const meta = nextFieldMeta(previous(), BASE, ['voice.nope'])
    expect(meta['voice.nope']).toBeUndefined()
  })

  test('confirmations accumulate across separate writes', () => {
    const first = nextFieldMeta(previous(), BASE, ['hook.primary_emotion'])
    const second = nextFieldMeta(previous(BASE, first), BASE, ['voice.descriptor'])
    const p = provenanceOf(second)
    expect(stateOf(p, 'hook.primary_emotion')).toBe('confirmed')
    expect(stateOf(p, 'voice.descriptor')).toBe('confirmed')
  })
})
