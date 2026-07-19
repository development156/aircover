import { describe, expect, test } from 'vitest'

import { draftSlug } from './slug'

describe('draftSlug', () => {
  test('derives the base from the site name with a 6-hex suffix', () => {
    expect(draftSlug('Sharma Dental')).toMatch(/^sharma-dental-[0-9a-f]{6}$/)
  })

  test('two calls with the same name differ — the suffix is the collision guard', () => {
    expect(draftSlug('Same Name')).not.toBe(draftSlug('Same Name'))
  })

  test('a name that slugifies to nothing still yields a usable slug', () => {
    expect(draftSlug('!!!')).toMatch(/^site-[0-9a-f]{6}$/)
  })
})
