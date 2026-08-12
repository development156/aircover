import { describe, expect, test } from 'vitest'
import { DEMO_FALLBACK_PAYLOAD, type BrandMemoryPayload } from '@sahoda/shared'

import { writeLeaf } from './leaf'
import { provenanceOf, stateOf, type BrainVersion } from './provenance'

const BASE = DEMO_FALLBACK_PAYLOAD

function version(
  n: number,
  source: BrainVersion['source'],
  payload: BrandMemoryPayload,
): BrainVersion {
  return { version: n, source, payload }
}

describe('provenanceOf', () => {
  test('no history means no provenance at all', () => {
    expect(provenanceOf([]).size).toBe(0)
  })

  test('a lone resolved version leaves every field a guess', () => {
    const p = provenanceOf([version(1, 'resolved', BASE)])
    expect(stateOf(p, 'voice.descriptor')).toBe('guessed')
    expect(stateOf(p, 'taboo.red_lines')).toBe('guessed')
    expect([...p.values()].every((state) => state === 'guessed')).toBe(true)
  })

  test('the demo fallback is a guess, not a confirmation', () => {
    const p = provenanceOf([version(1, 'system', BASE)])
    expect([...p.values()].every((state) => state === 'guessed')).toBe(true)
  })

  test('a manual version confirms only the fields it changed', () => {
    const edited = writeLeaf(BASE, 'hook.primary_emotion', 'Confidence')
    const p = provenanceOf([version(1, 'resolved', BASE), version(2, 'manual', edited)])

    expect(stateOf(p, 'hook.primary_emotion')).toBe('confirmed')
    expect(stateOf(p, 'hook.core_promise')).toBe('guessed')
    expect(stateOf(p, 'voice.descriptor')).toBe('guessed')
  })

  test('editing a list confirms that list', () => {
    const edited = writeLeaf(BASE, 'taboo.red_lines', ['No false urgency', 'No medical claims'])
    const p = provenanceOf([version(1, 'resolved', BASE), version(2, 'manual', edited)])
    expect(stateOf(p, 'taboo.red_lines')).toBe('confirmed')
  })

  test('reordering a list is an edit, so it confirms', () => {
    const reordered = writeLeaf(BASE, 'taboo.red_lines', [
      'No competitor bashing',
      'No false urgency',
    ])
    const p = provenanceOf([version(1, 'resolved', BASE), version(2, 'manual', reordered)])
    expect(stateOf(p, 'taboo.red_lines')).toBe('confirmed')
  })

  test('input order does not matter — versions are sorted before the walk', () => {
    const edited = writeLeaf(BASE, 'hook.primary_emotion', 'Confidence')
    const forwards = provenanceOf([version(1, 'resolved', BASE), version(2, 'manual', edited)])
    const backwards = provenanceOf([version(2, 'manual', edited), version(1, 'resolved', BASE)])
    expect([...backwards.entries()]).toEqual([...forwards.entries()])
  })

  describe('what a regenerate does to a confirmed field', () => {
    const confirmed = writeLeaf(BASE, 'hook.primary_emotion', 'Confidence')

    test('a regenerate that AGREES leaves the confirmation standing', () => {
      // The model returned the same sentence the user had typed. Nothing changed,
      // so nothing is demoted — agreement is not grounds to un-confirm.
      const p = provenanceOf([
        version(1, 'resolved', BASE),
        version(2, 'manual', confirmed),
        version(3, 'resolved', confirmed),
      ])
      expect(stateOf(p, 'hook.primary_emotion')).toBe('confirmed')
    })

    test('a regenerate that OVERWRITES reverts the field to a guess', () => {
      // What is on screen is now the model's sentence, not the user's. The ring
      // must stop counting it.
      const overwritten = writeLeaf(confirmed, 'hook.primary_emotion', 'Relief')
      const p = provenanceOf([
        version(1, 'resolved', BASE),
        version(2, 'manual', confirmed),
        version(3, 'resolved', overwritten),
      ])
      expect(stateOf(p, 'hook.primary_emotion')).toBe('guessed')
    })

    test('a field the user never touched stays a guess across all of it', () => {
      const p = provenanceOf([
        version(1, 'resolved', BASE),
        version(2, 'manual', confirmed),
        version(3, 'resolved', confirmed),
      ])
      expect(stateOf(p, 'voice.descriptor')).toBe('guessed')
    })
  })

  test('confirmations accumulate across separate edits', () => {
    const one = writeLeaf(BASE, 'hook.primary_emotion', 'Confidence')
    const two = writeLeaf(one, 'voice.descriptor', 'Blunt and quick')
    const p = provenanceOf([
      version(1, 'resolved', BASE),
      version(2, 'manual', one),
      version(3, 'manual', two),
    ])
    expect(stateOf(p, 'hook.primary_emotion')).toBe('confirmed')
    expect(stateOf(p, 'voice.descriptor')).toBe('confirmed')
  })

  test('an unknown path reads as a guess, never as confirmed', () => {
    const p = provenanceOf([version(1, 'manual', BASE)])
    expect(stateOf(p, 'voice.nope')).toBe('guessed')
  })

  test('alignment is never given a state — it is derived, not confirmable', () => {
    const p = provenanceOf([version(1, 'manual', BASE)])
    expect(p.has('alignment.signal_lock')).toBe(false)
    expect(p.has('alignment.note')).toBe(false)
  })
})
