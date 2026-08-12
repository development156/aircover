import { describe, expect, test } from 'vitest'
import { DEMO_FALLBACK_PAYLOAD, type BrandFieldMetaMap } from '@sahoda/shared'

import { writeLeaf } from './leaf'
import { hasEdits, provenanceOf, stateOf } from './provenance'

const BASE = DEMO_FALLBACK_PAYLOAD

function meta(entries: Record<string, boolean>): BrandFieldMetaMap {
  const map: BrandFieldMetaMap = {}
  for (const [path, confirmed] of Object.entries(entries)) {
    map[path] = { kind: 'asked', confirmed, source: confirmed ? 'owner' : 'model:brand_guidelines' }
  }
  return map
}

describe('provenanceOf', () => {
  test('a brain with no field_meta has no confirmations', () => {
    // Every row written before field_meta existed. Not a degraded read — nobody
    // confirmed anything in a way we recorded, which is what unconfirmed means.
    const p = provenanceOf(undefined)
    expect(p.size).toBe(0)
    expect(stateOf(p, 'voice.descriptor')).toBe('guessed')
  })

  test('an empty map leaves every registered field a guess', () => {
    const p = provenanceOf({})
    expect([...p.values()].every((state) => state === 'guessed')).toBe(true)
    expect(p.size).toBeGreaterThan(0)
  })

  test('confirmed:true reads as confirmed, confirmed:false as a guess', () => {
    const p = provenanceOf(meta({ 'hook.primary_emotion': true, 'voice.descriptor': false }))
    expect(stateOf(p, 'hook.primary_emotion')).toBe('confirmed')
    expect(stateOf(p, 'voice.descriptor')).toBe('guessed')
  })

  test('a field absent from the map is a guess, not an omission to be filled in', () => {
    const p = provenanceOf(meta({ 'hook.primary_emotion': true }))
    expect(stateOf(p, 'taboo.red_lines')).toBe('guessed')
  })

  test('source alone never confirms — only the flag does', () => {
    // A field whose source is the owner but which was not confirmed is still a
    // guess. `confirmed` is the claim; `source` is only where the text came from.
    const p = provenanceOf({
      'voice.descriptor': { kind: 'negotiated', confirmed: false, source: 'owner' },
    })
    expect(stateOf(p, 'voice.descriptor')).toBe('guessed')
  })

  test('an unknown path reads as a guess, never as confirmed', () => {
    const p = provenanceOf(meta({ 'voice.nope': true }))
    expect(stateOf(p, 'voice.nope')).toBe('guessed')
  })

  test('alignment is never given a state — it is derived, not confirmable', () => {
    // Even if something wrote one, it is not in the registry, so it never lands
    // in the map the ring counts.
    const p = provenanceOf(meta({ 'alignment.signal_lock': true }))
    expect(p.has('alignment.signal_lock')).toBe(false)
    expect(p.has('alignment.note')).toBe(false)
  })
})

describe('hasEdits', () => {
  test('an edited field counts', () => {
    expect(hasEdits(BASE, writeLeaf(BASE, 'hook.primary_emotion', 'Confidence'))).toBe(true)
  })

  test('an alignment-only difference does not — the model recomputes it', () => {
    const recomputed = { ...BASE, alignment: { ...BASE.alignment, note: 'different prose' } }
    expect(hasEdits(BASE, recomputed)).toBe(false)
  })

  test('an identical brain has no edits', () => {
    expect(hasEdits(BASE, BASE)).toBe(false)
  })
})
