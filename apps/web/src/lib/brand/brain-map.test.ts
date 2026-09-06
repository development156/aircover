import { describe, expect, test } from 'vitest'

import { BRAIN_FIELDS, BRAIN_SECTIONS } from './fields'
import type { Provenance } from './provenance'
import {
  DORMANT_STATES,
  MAP_H,
  MAP_W,
  brainMapLayout,
  mapAriaLabel,
  mapLevel,
  statesOf,
} from './brain-map'

describe('brainMapLayout', () => {
  const layout = brainMapLayout()

  test('one node per registered field, one hub per section, nothing invented', () => {
    expect(layout.nodes).toHaveLength(BRAIN_FIELDS.length)
    expect(layout.hubs).toHaveLength(BRAIN_SECTIONS.length)
    expect(new Set(layout.nodes.map((n) => n.path)).size).toBe(BRAIN_FIELDS.length)
  })

  test('every point sits inside the frame with room for its own radius', () => {
    const margin = 10
    for (const p of [layout.core, ...layout.hubs, ...layout.nodes]) {
      expect(p.x).toBeGreaterThanOrEqual(margin)
      expect(p.x).toBeLessThanOrEqual(MAP_W - margin)
      expect(p.y).toBeGreaterThanOrEqual(margin)
      expect(p.y).toBeLessThanOrEqual(MAP_H - margin)
    }
  })

  test('no two nodes share a spot', () => {
    const spots = layout.nodes.map((n) => `${n.x},${n.y}`)
    expect(new Set(spots).size).toBe(spots.length)
  })

  test('a node belongs to the hub of its own section', () => {
    for (const node of layout.nodes) {
      const field = BRAIN_FIELDS.find((f) => f.path === node.path)!
      expect(node.section).toBe(field.section)
      expect(layout.hubs.some((h) => h.section === node.section)).toBe(true)
    }
  })

  test('is deterministic', () => {
    expect(brainMapLayout()).toEqual(layout)
  })
})

describe('statesOf and mapLevel', () => {
  test('a dormant map is all guesses and counts zero', () => {
    const level = mapLevel(DORMANT_STATES)
    expect(level).toEqual({ confirmed: 0, intake: 0, guessed: 15, total: 15 })
  })

  test('counts confirmed and intake apart, and the label speaks the numbers', () => {
    const p: Provenance = new Map(
      BRAIN_FIELDS.map((f) => [
        f.path,
        f.path === 'taboo.red_lines'
          ? 'intake'
          : f.path === 'hook.core_promise'
            ? 'confirmed'
            : 'guessed',
      ]),
    )
    const level = mapLevel(statesOf(p))
    expect(level).toEqual({ confirmed: 1, intake: 1, guessed: 13, total: 15 })
    expect(mapAriaLabel(level)).toBe(
      "Brand Brain map: 1 of 15 fields confirmed, 1 from your answers, 13 still Sahoda's guess.",
    )
  })

  test('an unknown path reads as a guess, never as confirmed', () => {
    expect(mapLevel({ nonsense: 'confirmed' }).confirmed).toBe(0)
  })
})
