import { describe, expect, test } from 'vitest'

import { moduleNumbers } from './module-numbers'

describe('moduleNumbers', () => {
  test('counts 1, 2, 3 in the order modules are rendered', () => {
    const n = moduleNumbers()
    expect([n.next(), n.next(), n.next()]).toEqual([1, 2, 3])
  })

  test('leaves no hole when a conditional module is absent', () => {
    // The report renders modules through one counter, so an absent "When to
    // post" simply never asks for a number and the one after it takes the next.
    const n = moduleNumbers()
    const shown: number[] = []
    for (const present of [true, true, false, true]) if (present) shown.push(n.next())
    expect(shown).toEqual([1, 2, 3])
  })
})
