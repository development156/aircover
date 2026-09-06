import { describe, expect, it } from 'vitest'
import { openSite } from './tiers'
import type { PageSource, ScrapedPage } from './types'

const HOME = 'https://example.com/'
const MENU = 'https://example.com/menu'
const PROSE = Array.from({ length: 80 }, (_, i) => `Sentence number ${i} about the bakery.`).join(
  ' ',
)

function source(
  name: string,
  pages: Record<string, string>,
  links: string[] = [],
): PageSource & { calls: string[] } {
  const calls: string[] = []
  return {
    name,
    creditsPerCall: 0,
    calls,
    async map() {
      calls.push('map')
      return links.map((url) => ({ url }))
    },
    async scrape(url: string): Promise<ScrapedPage> {
      calls.push(url)
      return { url, title: name, markdown: pages[url] ?? '', statusCode: 200 }
    },
  }
}

describe("tier 3 is handed tier 1's links, because TinyFish Fetch cannot discover a site", () => {
  it('reads the pages tier 1 found when its own map is empty', async () => {
    // Tier 1 sees the shell and its links, but no words (a JS-only site).
    const direct = source('direct', { [HOME]: '', [MENU]: '' }, [MENU])
    // The vendor renders the JS and finds words, but has no map of its own.
    const vendor = source('tinyfish', { [HOME]: PROSE, [MENU]: PROSE }, [])

    const result = await openSite(HOME, {
      sources: { direct, vendor },
      flags: { vendor: true },
    })

    expect(result.servedBy).toBe(3)
    expect(result.outcome.ok).toBe(true)
    // Both pages, not just the home page: the hand-off is what makes that true.
    expect(vendor.calls).toContain(HOME)
    expect(vendor.calls).toContain(MENU)
    // And nothing was spent: the vendor declares zero per call.
    expect(result.creditsUsed).toBe(0)
    expect(result.attempts.map((a) => a.tier)).toEqual([1, 3])
  })

  it('does not reach the vendor when the flag is off, whatever the key', async () => {
    const direct = source('direct', { [HOME]: '' }, [])
    const vendor = source('tinyfish', { [HOME]: PROSE }, [])
    const result = await openSite(HOME, { sources: { direct, vendor } })
    expect(vendor.calls).toEqual([])
    expect(result.servedBy).toBeNull()
  })
})
