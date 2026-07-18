import { describe, expect, test } from 'vitest'

import { slugify, withSuffix } from './slug'

describe('slugify', () => {
  test('lowercases and replaces spaces with dashes', () => {
    expect(slugify('Chai And Chapters')).toBe('chai-and-chapters')
  })

  test('strips diacritics', () => {
    expect(slugify('Café Créme')).toBe('cafe-creme')
  })

  test('collapses runs of symbols into one dash and trims edge dashes', () => {
    expect(slugify('  -- Chai & Chapters!! ')).toBe('chai-chapters')
  })

  test('falls back to "workspace" when nothing usable remains', () => {
    expect(slugify('★☆♥')).toBe('workspace')
    expect(slugify('')).toBe('workspace')
  })

  test('caps length at 48 without a trailing dash', () => {
    const slug = slugify('a'.repeat(40) + ' ' + 'b'.repeat(40))
    expect(slug.length).toBeLessThanOrEqual(48)
    expect(slug.endsWith('-')).toBe(false)
  })
})

describe('withSuffix', () => {
  test('attempt 0 returns the base slug unchanged', () => {
    expect(withSuffix('chai', 0)).toBe('chai')
  })

  test('attempt n appends -(n+1)', () => {
    expect(withSuffix('chai', 1)).toBe('chai-2')
    expect(withSuffix('chai', 4)).toBe('chai-5')
  })

  test('respects the length cap when appending', () => {
    const long = 'a'.repeat(48)
    const suffixed = withSuffix(long, 1)
    expect(suffixed.length).toBeLessThanOrEqual(48)
    expect(suffixed.endsWith('-2')).toBe(true)
  })
})
