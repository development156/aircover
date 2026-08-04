import { describe, expect, test } from 'vitest'

import { extractLinks, hasLink } from './detect-link'

describe('extractLinks', () => {
  test('returns an empty list for an empty body', () => {
    expect(extractLinks('')).toEqual([])
  })

  test('returns an empty list for prose with no links', () => {
    expect(extractLinks('Fresh chai and warm chapters, every morning.')).toEqual([])
  })

  test('finds a full https URL', () => {
    expect(extractLinks('Book now https://chaiandchapters.com/book')).toEqual([
      'https://chaiandchapters.com/book',
    ])
  })

  test('treats a bare domain as a link because X wraps it in t.co', () => {
    expect(extractLinks('Book now at chaiandchapters.com')).toEqual(['chaiandchapters.com'])
  })

  test('finds a link in the middle of a sentence', () => {
    expect(extractLinks('Head to https://sahoda.co today for the launch')).toEqual([
      'https://sahoda.co',
    ])
  })

  test('does not swallow a trailing sentence period into the URL', () => {
    expect(extractLinks('see https://a.com.')).toEqual(['https://a.com'])
  })

  test('does not swallow trailing commas, question marks or quotes', () => {
    expect(extractLinks('Try https://a.com, or https://b.com?')).toEqual([
      'https://a.com',
      'https://b.com',
    ])
  })

  test('does not swallow a trailing period after a bare domain with a path', () => {
    expect(extractLinks('Read example.com/blog.')).toEqual(['example.com/blog'])
  })

  test('keeps balanced parentheses that belong to the URL', () => {
    expect(extractLinks('See https://en.wikipedia.org/wiki/Chai_(drink) for more')).toEqual([
      'https://en.wikipedia.org/wiki/Chai_(drink)',
    ])
  })

  test('drops an unbalanced closing parenthesis that wraps the URL', () => {
    expect(extractLinks('Our menu (see https://a.com/menu) is live')).toEqual([
      'https://a.com/menu',
    ])
  })

  test('extracts the target from markdown link syntax and ignores the label', () => {
    expect(extractLinks('[Read the menu](https://a.com/menu) — **now open**')).toEqual([
      'https://a.com/menu',
    ])
  })

  test('ignores a markdown link with a relative target', () => {
    expect(extractLinks('[Read more](/blog/opening-day)')).toEqual([])
  })

  test('returns multiple links in order of appearance', () => {
    expect(extractLinks('First https://a.com then b.com then https://c.com')).toEqual([
      'https://a.com',
      'b.com',
      'https://c.com',
    ])
  })

  test('dedupes a link repeated verbatim in the body', () => {
    expect(extractLinks('Book https://a.com — really, https://a.com')).toEqual(['https://a.com'])
  })

  test('does not treat an email address as a link', () => {
    expect(extractLinks('Write to hello@chaiandchapters.com for bookings')).toEqual([])
  })

  test('does not treat a mailto address as a link', () => {
    expect(extractLinks('mailto:hello@a.com')).toEqual([])
  })

  test('does not treat the bare word http as a link', () => {
    expect(extractLinks('The http protocol is older than most of our staff')).toEqual([])
  })

  test('does not treat a scheme with no host as a link', () => {
    expect(extractLinks('Broken paste: https://.')).toEqual([])
  })

  test('finds a www host that has no scheme', () => {
    expect(extractLinks('Visit www.chaiandchapters.com today')).toEqual(['www.chaiandchapters.com'])
  })

  test('finds an uppercase URL', () => {
    expect(extractLinks('VISIT HTTPS://A.COM NOW')).toEqual(['HTTPS://A.COM'])
  })

  test('does not treat filenames with non-TLD extensions as links', () => {
    expect(extractLinks('Ship Node.js, report.pdf, index.html and deploy.sh')).toEqual([])
  })

  test('returns only verbatim substrings of the body, never rewritten text', () => {
    const body = 'Go to Chaiandchapters.COM/Menu and https://A.com/Path'
    const links = extractLinks(body)
    // Guard the guard: an implementation that returns nothing must not pass a
    // loop-of-assertions test vacuously.
    expect(links.length).toBeGreaterThan(0)
    for (const link of links) {
      expect(body).toContain(link)
    }
  })

  test('never returns an empty or whitespace-only link', () => {
    const body = 'https://. www. a.com ... (https://b.com).'
    const links = extractLinks(body)
    expect(links.length).toBeGreaterThan(0)
    for (const link of links) {
      expect(link.trim()).toBe(link)
      expect(link.length).toBeGreaterThan(0)
    }
  })

  test('does not mutate or depend on state across calls', () => {
    const body = 'Visit a.com and b.com'
    // Pinned to a literal, not to a second call: comparing the function to
    // itself passes even when both calls are wrong in the same way.
    expect(extractLinks(body)).toEqual(['a.com', 'b.com'])
    expect(extractLinks(body)).toEqual(['a.com', 'b.com'])
  })

  test('pins the accepted limitation: a mixed-case bare TLD reads as a missing space, not a link', () => {
    // "today.In" is far more often a typo for "today. In" than a Indian domain.
    // A future change that starts detecting this must update this test deliberately.
    expect(extractLinks('Open today.In store only')).toEqual([])
    expect(extractLinks('Visit Example.Com')).toEqual([])
  })

  test('does not read a price or quantity with a missing space as a bare domain', () => {
    // Over-counting by 23 on X can hard-block a valid post at the 280 boundary,
    // so the common numeric shapes in retail copy must not read as hosts.
    expect(extractLinks('Chai at Rs 40.in store only')).toEqual([])
    expect(extractLinks('Only 2.in stock')).toEqual([])
    expect(extractLinks('Version 2.0.in stores now')).toEqual([])
    expect(extractLinks('Buy 1 get 1.co')).toEqual([])
  })

  test('still detects an explicit numeric host, where intent is unambiguous', () => {
    expect(extractLinks('Open https://163.com now')).toEqual(['https://163.com'])
    expect(extractLinks('Open www.163.com now')).toEqual(['www.163.com'])
  })

  test('detects bare domains on the hospitality and regional TLDs this app targets', () => {
    // Under-detection is the dangerous direction: the meter under-counts by 23
    // and X rejects a post the composer said would fit.
    for (const host of [
      'chaiandchapters.cafe',
      'brew.coffee',
      'corner.bakery',
      'sahoda.pro',
      'chaiandchapters.in',
      'shop.my',
      'store.ph',
      'books.lk',
    ]) {
      expect(extractLinks(`Visit ${host} today`)).toEqual([host])
    }
  })

  test('pins the accepted limitation: an unlisted TLD on a bare domain is missed', () => {
    // No curated list closes this class. A scheme or www. prefix is the escape
    // hatch, and both are honoured here.
    expect(extractLinks('Visit brew.espresso today')).toEqual([])
    expect(extractLinks('Visit https://brew.espresso today')).toEqual(['https://brew.espresso'])
    expect(extractLinks('Visit www.brew.espresso today')).toEqual(['www.brew.espresso'])
  })

  test('pins the accepted limitation: a lowercase abbreviation before a real TLD is detected as a link', () => {
    // "etc.in" is indistinguishable from a host without a dictionary. Accepted
    // for Alpha: the composer over-counts by 23 chars on X in this rare case.
    expect(extractLinks('chai, coffee, etc.in the back room')).toEqual(['etc.in'])
  })
})

describe('hasLink', () => {
  test('is false for an empty body', () => {
    expect(hasLink('')).toBe(false)
  })

  test('is false for prose with no links', () => {
    expect(hasLink('Two chapters and one cup, please')).toBe(false)
  })

  test('is false for a body whose only at-sign token is an email address', () => {
    expect(hasLink('Email hello@a.com')).toBe(false)
  })

  test('is true for a full URL', () => {
    expect(hasLink('Book at https://a.com/book')).toBe(true)
  })

  test('is true for a bare domain, matching the 23-char link weighting on X', () => {
    expect(hasLink('Book at chaiandchapters.com')).toBe(true)
  })

  test('agrees with extractLinks on whether a body contains a link', () => {
    const bodies = [
      '',
      'no links here',
      'https://a.com',
      'a.com',
      'hello@a.com',
      'Node.js is fine',
      'www.a.com',
    ]
    for (const body of bodies) {
      expect(hasLink(body)).toBe(extractLinks(body).length > 0)
    }
  })
})
