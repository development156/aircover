import { describe, expect, test } from 'vitest'

import { BRAIN_FIELDS } from '@/lib/brand/fields'

import { blankReason } from './blank'

/**
 * MEASURED 2026-09-06 on the wt-core preview against production: the Signal
 * Resolution Console's editor was given three spaces for `hook.core_promise`
 * and "Save · free" wrote them as version 11, `field_meta` stamping the field
 * `source: 'owner', confirmed: true`. The Identity tab's list editor did the
 * same with a single space in the third core value (version 8). The console's
 * own copy beside the editor says "There is no way to record “nothing” here",
 * and nothing enforced it: `validate()` in `brand-field.ts` checked type and
 * length only, and `pruneBlankListEntries` skips the three fixed lists on
 * purpose. One rule, shared by the server action and both editors.
 */
const TEXT = BRAIN_FIELDS.find((f) => f.path === 'hook.core_promise')!
const FIXED_LIST = BRAIN_FIELDS.find((f) => f.path === 'brand_persona.core_values')!
const OPEN_LIST = BRAIN_FIELDS.find((f) => f.path === 'taboo.red_lines')!

describe('blankReason', () => {
  test('a text field made of whitespace is blank', () => {
    expect(blankReason(TEXT, '   ')).toMatch(/blank/i)
    expect(blankReason(TEXT, '')).toMatch(/blank/i)
    expect(blankReason(TEXT, '\n\t')).toMatch(/blank/i)
  })

  test('a text field with words is not', () => {
    expect(blankReason(TEXT, 'Show up.')).toBeNull()
  })

  test('a fixed list with one whitespace entry is blank, and says which', () => {
    const reason = blankReason(FIXED_LIST, ['Craft', 'Community', ' '])
    expect(reason).toMatch(/blank/i)
    expect(reason).toMatch(/three/i)
  })

  test('a fixed list with three real entries is not', () => {
    expect(blankReason(FIXED_LIST, ['Craft', 'Community', 'Honesty'])).toBeNull()
  })

  test('an EMPTY open list is a real answer ("there are none"), never blank', () => {
    expect(blankReason(OPEN_LIST, [])).toBeNull()
  })

  test('an open list whose every entry is whitespace is blank', () => {
    // The save path prunes blank entries, so this would be written as `[]` —
    // but the person pressed Save on words they can see, and they would find
    // the field empty. Say so before the write, not after.
    expect(blankReason(OPEN_LIST, [' ', ''])).toMatch(/blank/i)
  })

  test('an open list with one real entry beside a blank one is not blank', () => {
    // The blank is pruned on save; the real entry survives.
    expect(blankReason(OPEN_LIST, ['guilt-free', ' '])).toBeNull()
  })
})
