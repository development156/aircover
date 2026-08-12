import { describe, expect, test } from 'vitest'
import { DEMO_FALLBACK_PAYLOAD } from '@sahoda/shared'

import { leavesEqual, readLeaf, writeLeaf } from './leaf'

describe('readLeaf', () => {
  test('reads a string leaf', () => {
    expect(readLeaf(DEMO_FALLBACK_PAYLOAD, 'brand_persona.archetype')).toBe('The Caregiver')
  })

  test('reads a list leaf', () => {
    expect(readLeaf(DEMO_FALLBACK_PAYLOAD, 'taboo.red_lines')).toEqual([
      'No false urgency',
      'No competitor bashing',
    ])
  })

  test('returns undefined for a path that names nothing', () => {
    expect(readLeaf(DEMO_FALLBACK_PAYLOAD, 'voice.nope')).toBeUndefined()
    expect(readLeaf(DEMO_FALLBACK_PAYLOAD, 'nope.nope')).toBeUndefined()
    expect(readLeaf(DEMO_FALLBACK_PAYLOAD, 'voice')).toBeUndefined()
    expect(readLeaf(DEMO_FALLBACK_PAYLOAD, 'a.b.c')).toBeUndefined()
  })
})

describe('writeLeaf', () => {
  test('returns a new brain with the leaf replaced', () => {
    const next = writeLeaf(DEMO_FALLBACK_PAYLOAD, 'hook.primary_emotion', 'Confidence')
    expect(next.hook.primary_emotion).toBe('Confidence')
    expect(next.hook.core_promise).toBe(DEMO_FALLBACK_PAYLOAD.hook.core_promise)
  })

  test('does not mutate the input', () => {
    const before = DEMO_FALLBACK_PAYLOAD.hook.primary_emotion
    writeLeaf(DEMO_FALLBACK_PAYLOAD, 'hook.primary_emotion', 'Confidence')
    expect(DEMO_FALLBACK_PAYLOAD.hook.primary_emotion).toBe(before)
  })

  test('a mistyped path cannot invent a field', () => {
    const next = writeLeaf(DEMO_FALLBACK_PAYLOAD, 'voice.descriptorr', 'x')
    expect(next).toBe(DEMO_FALLBACK_PAYLOAD)
    expect('descriptorr' in next.voice).toBe(false)
  })
})

describe('leavesEqual', () => {
  test('compares strings', () => {
    expect(leavesEqual('a', 'a')).toBe(true)
    expect(leavesEqual('a', 'b')).toBe(false)
  })

  test('compares lists index-wise, so a reorder is a real change', () => {
    expect(leavesEqual(['a', 'b'], ['a', 'b'])).toBe(true)
    expect(leavesEqual(['a', 'b'], ['b', 'a'])).toBe(false)
    expect(leavesEqual(['a', 'b'], ['a'])).toBe(false)
  })

  test('a string never equals a list', () => {
    expect(leavesEqual('a', ['a'])).toBe(false)
  })

  test('undefined equals only undefined', () => {
    expect(leavesEqual(undefined, undefined)).toBe(true)
    expect(leavesEqual(undefined, '')).toBe(false)
  })
})
