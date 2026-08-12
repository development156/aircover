import { describe, expect, test } from 'vitest'
import { DEMO_FALLBACK_PAYLOAD } from '@sahoda/shared'

import { editedPaths } from './edited-paths'
import { writeLeaf } from './leaf'

const BASE = DEMO_FALLBACK_PAYLOAD

describe('editedPaths', () => {
  test('names the field a person changed', () => {
    const edited = writeLeaf(BASE, 'hook.primary_emotion', 'Confidence')
    expect(editedPaths(BASE, edited)).toEqual(['hook.primary_emotion'])
  })

  test('names every changed field, not just the first', () => {
    const twice = writeLeaf(
      writeLeaf(BASE, 'hook.primary_emotion', 'Confidence'),
      'voice.descriptor',
      'Brisk and plain',
    )
    expect([...editedPaths(BASE, twice)].sort()).toEqual([
      'hook.primary_emotion',
      'voice.descriptor',
    ])
  })

  test('an untouched brain claims nothing', () => {
    // Approving what the model wrote is not confirming it field by field.
    expect(editedPaths(BASE, BASE)).toEqual([])
  })

  test('an alignment-only difference is not a human edit', () => {
    // The model recomputes signal_lock on every resolve; nobody edits it.
    const recomputed = { ...BASE, alignment: { ...BASE.alignment, note: 'different prose' } }
    expect(editedPaths(BASE, recomputed)).toEqual([])
  })

  test('with no baseline, nothing is claimed', () => {
    // Under-claim rather than mark fifteen fields confirmed on a press.
    const edited = writeLeaf(BASE, 'hook.primary_emotion', 'Confidence')
    expect(editedPaths(null, edited)).toEqual([])
  })

  test('a reordered list is a real edit', () => {
    const reordered = writeLeaf(BASE, 'taboo.red_lines', [...BASE.taboo.red_lines].reverse())
    expect(editedPaths(BASE, reordered)).toEqual(['taboo.red_lines'])
  })
})
