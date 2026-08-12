import { describe, expect, test } from 'vitest'
import { DEMO_FALLBACK_PAYLOAD } from '@sahoda/shared'

import { BRAIN_FIELDS, BRAIN_SECTIONS, DERIVED_FIELDS, RING_DENOMINATOR } from './fields'
import { readLeaf } from './leaf'

/** Every leaf actually present in a real payload, as dotted paths. */
function payloadLeafPaths(): string[] {
  const paths: string[] = []
  for (const [section, bag] of Object.entries(DEMO_FALLBACK_PAYLOAD)) {
    for (const key of Object.keys(bag as Record<string, unknown>)) {
      paths.push(`${section}.${key}`)
    }
  }
  return paths.sort()
}

describe('the field registry covers the payload exactly', () => {
  test('every registered field resolves to a real leaf', () => {
    for (const field of BRAIN_FIELDS) {
      expect(readLeaf(DEMO_FALLBACK_PAYLOAD, field.path), field.path).toBeDefined()
    }
  })

  test('every payload leaf is either editable or declared derived', () => {
    const covered = new Set([
      ...BRAIN_FIELDS.map((f) => f.path),
      ...DERIVED_FIELDS.map((f) => f.path),
      // Prose that accompanies the derived verdict rather than a field of its own —
      // it renders as the Signal lock's evidence, so it is covered, not missing.
      'alignment.note',
    ])
    const uncovered = payloadLeafPaths().filter((path) => !covered.has(path))
    expect(uncovered).toEqual([])
  })

  test('no path is registered twice', () => {
    const paths = BRAIN_FIELDS.map((f) => f.path)
    expect(new Set(paths).size).toBe(paths.length)
  })

  /**
   * The denominator must equal the set a user can actually act on. A field
   * counted here but not editable on /brain is a hole the ring can never fill,
   * and the "most valuable unanswered question" would eventually point at a
   * question with no answer box.
   */
  test('the denominator is exactly the editable set', () => {
    expect(RING_DENOMINATOR).toBe(BRAIN_FIELDS.length)
    const derivedPaths = new Set(DERIVED_FIELDS.map((f) => f.path))
    for (const field of BRAIN_FIELDS) {
      expect(derivedPaths.has(field.path), `${field.path} is both editable and derived`).toBe(false)
    }
  })

  test('every field belongs to a rendered section, and no section is empty', () => {
    const sectionKeys = new Set(BRAIN_SECTIONS.map((s) => s.key))
    for (const field of BRAIN_FIELDS) {
      expect(sectionKeys.has(field.section), field.path).toBe(true)
    }
    for (const section of BRAIN_SECTIONS) {
      expect(
        BRAIN_FIELDS.some((f) => f.section === section.key),
        `${section.key} renders as a card with no fields`,
      ).toBe(true)
    }
  })

  test('every field carries a question the ring can ask', () => {
    for (const field of BRAIN_FIELDS) {
      expect(field.question.length, field.path).toBeGreaterThan(0)
      expect(field.question.endsWith('?'), `${field.path} question is not a question`).toBe(true)
    }
  })
})
