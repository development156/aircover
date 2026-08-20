import { describe, expect, test } from 'vitest'

import { formatBytes } from './format-bytes'

describe('formatBytes', () => {
  test.each([
    [0, '0 B'],
    [1, '1 B'],
    [1023, '1023 B'],
    [1024, '1 KB'],
    [1_048_576, '1.0 MB'],
    [5_242_880, '5.0 MB'],
  ])('%i bytes reads as %s', (bytes, expected) => {
    expect(formatBytes(bytes)).toBe(expected)
  })

  test.each([
    ['null', null],
    ['undefined', undefined],
    ['NaN', Number.NaN],
    ['Infinity', Number.POSITIVE_INFINITY],
    ['a negative count', -1],
    ['a string', '1024' as unknown as number],
  ])('returns null rather than a figure for %s', (_label, value) => {
    // Null, not "0 B". A size we do not have is not a size of zero, and the
    // caller needs to be able to say which kind of nothing it is.
    expect(formatBytes(value as number)).toBeNull()
  })
})
