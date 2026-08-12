import { describe, expect, test } from 'vitest'

import { brainRing, ringAriaLabel, ringHoverLine } from './brain-ring'
import { BRAIN_FIELDS, RING_DENOMINATOR } from './fields'
import type { FieldState, Provenance } from './provenance'

function provenance(confirmedPaths: readonly string[]): Provenance {
  return new Map<string, FieldState>(
    BRAIN_FIELDS.map((field) => [
      field.path,
      confirmedPaths.includes(field.path) ? 'confirmed' : 'guessed',
    ]),
  )
}

const NOTHING = provenance([])
const EVERYTHING = provenance(BRAIN_FIELDS.map((f) => f.path))

describe('brainRing', () => {
  test('a freshly resolved brain counts zero, not full', () => {
    // Every field is FILLED the moment the model answers. None is confirmed.
    const ring = brainRing(NOTHING)
    expect(ring.confirmed).toBe(0)
    expect(ring.percent).toBe(0)
    expect(ring.total).toBe(RING_DENOMINATOR)
  })

  test('a fully confirmed brain reaches 100', () => {
    const ring = brainRing(EVERYTHING)
    expect(ring.confirmed).toBe(RING_DENOMINATOR)
    expect(ring.percent).toBe(100)
    expect(ring.next).toBeNull()
  })

  test('derived fields are outside the denominator', () => {
    // alignment.* would be 2 more leaves; the ring must not know about them.
    expect(brainRing(EVERYTHING).total).toBe(BRAIN_FIELDS.length)
    expect(brainRing(EVERYTHING).percent).toBe(100)
  })

  test('confirming a field moves the count by one', () => {
    const ring = brainRing(provenance(['voice.descriptor']))
    expect(ring.confirmed).toBe(1)
  })

  test('a confirmed field is never also the next question', () => {
    const first = BRAIN_FIELDS[0]!
    const ring = brainRing(provenance([first.path]))
    expect(ring.next?.path).not.toBe(first.path)
    expect(ring.next?.path).toBe(BRAIN_FIELDS[1]!.path)
  })

  test('an empty provenance (no brain) still reads as zero rather than throwing', () => {
    const ring = brainRing(new Map())
    expect(ring.confirmed).toBe(0)
    expect(ring.next?.path).toBe(BRAIN_FIELDS[0]!.path)
  })
})

describe('the next question', () => {
  test('is the highest-priority unconfirmed field', () => {
    expect(brainRing(NOTHING).next?.path).toBe('hook.core_promise')
  })

  test('walks down the priority order as fields are confirmed', () => {
    const ring = brainRing(provenance(['hook.core_promise']))
    expect(ring.next?.path).toBe('customer_persona.primary_pain_point')
  })
})

describe('ringHoverLine', () => {
  test('is one line, and it is the question itself', () => {
    const line = ringHoverLine(brainRing(NOTHING))
    expect(line).toBe(BRAIN_FIELDS[0]!.question)
    expect(line.includes('\n')).toBe(false)
  })

  test('says so honestly when there is nothing left to ask', () => {
    const line = ringHoverLine(brainRing(EVERYTHING))
    expect(line).toContain('Every field is confirmed')
    expect(line.includes('?')).toBe(false)
  })
})

describe('ringAriaLabel', () => {
  test('speaks the numbers rather than leaving them to the arc', () => {
    const label = ringAriaLabel(brainRing(provenance(['voice.descriptor'])))
    expect(label).toContain(`1 of ${RING_DENOMINATOR} fields confirmed`)
  })
})
