import { describe, expect, it } from 'vitest'

import { BRAIN_FIELDS } from '@/lib/brand/fields'
import { countConfirmedFields } from '@/lib/brand/confirmed-count'

/**
 * ONE FRACTION OF ONE BRAIN.
 *
 * /brain draws a ring and /loop says whether the week will be written in a
 * voice anybody agreed to. Both are the same count, so the failure this file
 * exists to catch is the two screens printing different numerators for the
 * same brand_memory row.
 */

const first = BRAIN_FIELDS[0]?.path as string
const second = BRAIN_FIELDS[1]?.path as string

describe('countConfirmedFields', () => {
  it('counts nothing for a brain that has never been touched', () => {
    expect(countConfirmedFields({})).toBe(0)
    expect(countConfirmedFields(null)).toBe(0)
    expect(countConfirmedFields(undefined)).toBe(0)
  })

  it('counts a field only when a person confirmed it', () => {
    expect(
      countConfirmedFields({
        field_meta: { [first]: { confirmed: true }, [second]: { confirmed: false } },
      }),
    ).toBe(1)
  })

  /**
   * `confirmed` is a boolean in the stored schema, and a truthy string is what
   * arrives when a payload has been round-tripped through something careless.
   * Counting it would inflate the fraction the customer is asked to act on.
   */
  it('does not count a field whose confirmed flag is not the boolean true', () => {
    expect(countConfirmedFields({ field_meta: { [first]: { confirmed: 'true' } } })).toBe(0)
    expect(countConfirmedFields({ field_meta: { [first]: { confirmed: 1 } } })).toBe(0)
  })

  /**
   * The defect worth having a test for: `field_meta` can carry paths that are
   * not on the ring — a derived field, or a key from an older payload shape.
   * Counting those prints a numerator bigger than /brain's for one brain.
   */
  it('ignores confirmed entries for paths the ring does not count', () => {
    expect(
      countConfirmedFields({
        field_meta: {
          [first]: { confirmed: true },
          'alignment.signal_lock': { confirmed: true },
          'a.path.that.was.removed': { confirmed: true },
        },
      }),
    ).toBe(1)
  })

  it('never exceeds the ring denominator, even for a fully confirmed brain', () => {
    const meta: Record<string, unknown> = {}
    for (const f of BRAIN_FIELDS) meta[f.path] = { confirmed: true }
    meta['not.on.the.ring'] = { confirmed: true }
    expect(countConfirmedFields({ field_meta: meta })).toBe(BRAIN_FIELDS.length)
  })
})
