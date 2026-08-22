import { describe, expect, it } from 'vitest'

import { fmtSize, hostOf, initialOf, kindOf } from './refs'

describe('hostOf', () => {
  it('reads the host out of a full URL and drops www.', () => {
    expect(hostOf('https://www.chaiandchapters.in/about')).toBe('chaiandchapters.in')
  })

  it('assumes https for a bare domain', () => {
    expect(hostOf('chaiandchapters.in')).toBe('chaiandchapters.in')
  })

  /**
   * `new URL('https://@handle')` PARSES — with an empty hostname and the handle
   * in the userinfo. The source returns that empty string, so a card for an
   * Instagram handle rendered a blank title and a `?` avatar. A handle is not a
   * URL, and the honest label is what the person typed.
   */
  it('shows a bare @handle as typed rather than as an empty host', () => {
    expect(hostOf('@chaiandchapters')).toBe('chaiandchapters')
    expect(hostOf('@chaiandchapters')).not.toBe('')
  })

  it('trims, and survives text that is not a link at all', () => {
    expect(hostOf('  the shop on residency road  ')).toBe('the shop on residency road')
  })
})

describe('kindOf — what the link IS, never what it looks like', () => {
  it.each([
    ['instagram.com', 'Instagram account'],
    ['www.pinterest.co.uk', 'Pinterest board'],
    ['behance.net', 'Design reference'],
    ['dribbble.com', 'Design reference'],
    ['tiktok.com', 'TikTok account'],
    ['youtube.com', 'YouTube channel'],
    ['linkedin.com', 'LinkedIn page'],
    ['chaiandchapters.in', 'Website'],
  ])('%s → %s', (host, kind) => {
    expect(kindOf(host)).toBe(kind)
  })

  /**
   * The mock-up labelled references "Minimal" and "Editorial". Nothing has
   * fetched the page at this point, so those are verdicts on something nobody
   * has looked at. Every label this function can return is a platform noun.
   */
  it('never returns a taste adjective', () => {
    const taste = /minimal|editorial|bold|playful|clean|modern/i
    for (const host of ['instagram.com', 'behance.net', 'anything.example']) {
      expect(kindOf(host)).not.toMatch(taste)
    }
  })
})

describe('initialOf', () => {
  it('uses the first letter', () => {
    expect(initialOf('chaiandchapters.in')).toBe('C')
  })

  it('falls back to ? on an empty host rather than rendering nothing', () => {
    expect(initialOf('')).toBe('?')
  })
})

describe('fmtSize', () => {
  it('rounds a small file UP to 1 KB — "0 KB" reads as a failed upload', () => {
    expect(fmtSize(1)).toBe('1 KB')
    expect(fmtSize(400)).toBe('1 KB')
  })

  it('switches to MB past a megabyte', () => {
    expect(fmtSize(2_500_000)).toBe('2.4 MB')
    expect(fmtSize(200_000)).toBe('195 KB')
  })

  it('does not print a number for a size it does not have', () => {
    expect(fmtSize(Number.NaN)).toBe('—')
  })
})
