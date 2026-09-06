import { describe, expect, it } from 'vitest'
import { countWords, crawlSite, selectPages } from './crawl-site'
import type { PageSource, ScrapedPage } from './types'
import { PageSourceError } from './vendor-error'

const HOME = 'https://chaiandchapters.in/'

function page(url: string, markdown: string, statusCode = 200): ScrapedPage {
  return { url, markdown, title: 'Page', statusCode }
}

/** Fixture client — no network, no key. */
function client(opts: {
  links?: string[]
  pages?: Record<string, ScrapedPage>
  mapThrows?: unknown
  scrapeThrows?: unknown
}): { client: PageSource; scraped: string[] } {
  const scraped: string[] = []
  return {
    scraped,
    client: {
      name: 'fixture',
      creditsPerCall: 1, // the vendor's billing, so the committed cost tests keep meaning
      async map() {
        if (opts.mapThrows) throw opts.mapThrows
        return (opts.links ?? []).map((url) => ({ url }))
      },
      async scrape(url: string) {
        scraped.push(url)
        if (opts.scrapeThrows) throw opts.scrapeThrows
        return opts.pages?.[url] ?? page(url, '', 404)
      },
    },
  }
}

describe('countWords', () => {
  it('counts prose and ignores markdown syntax, links and images', () => {
    expect(countWords('# Title\n\n![alt](a.png)\n\n[Chai](/x) and **books**')).toBe(4)
  })

  it('is zero for an empty page — the JS-only signature', () => {
    expect(countWords('')).toBe(0)
    expect(countWords('\n\n---\n\n')).toBe(0)
  })
})

describe('selectPages', () => {
  it('takes the home page first, then the pages a business writes about itself', () => {
    const selected = selectPages(
      HOME,
      [
        'https://chaiandchapters.in/blog/post-1',
        'https://chaiandchapters.in/about',
        'https://chaiandchapters.in/menu',
      ],
      3,
    )
    expect(selected[0]).toBe(HOME)
    expect(selected[1]).toBe('https://chaiandchapters.in/about')
    expect(selected[2]).toBe('https://chaiandchapters.in/menu')
  })

  it('skips a lawyer voice and a login wall', () => {
    const selected = selectPages(
      HOME,
      ['https://chaiandchapters.in/privacy', 'https://chaiandchapters.in/terms'],
      5,
    )
    expect(selected).toEqual([HOME])
  })

  it("takes ONLY the founder's own host — a sitemap can reference anything", () => {
    const selected = selectPages(
      'https://x.in/',
      [
        'https://x.in/about',
        'https://shop.x.in/catalogue', // subdomain: not obviously theirs
        'https://cdn.example.com/assets', // third-party host
        'https://partner.co/x-in-listing',
      ],
      5,
    )
    expect(selected).toEqual(['https://x.in/', 'https://x.in/about'])
  })

  it('never exceeds the cap, and never repeats a page', () => {
    const links = Array.from({ length: 40 }, (_, i) => `https://chaiandchapters.in/p${i}`)
    const selected = selectPages(HOME, [...links, HOME], 5)
    expect(selected).toHaveLength(5)
    expect(new Set(selected).size).toBe(5)
  })
})

/**
 * Genuinely different prose per page. Appending a suffix to one shared
 * paragraph is NOT enough — that is exactly the product-variant shape the
 * near-duplicate check exists to reject, and writing the fixture that way was
 * how I found out the check works.
 */
const TOPICS = [
  'shelves poetry Odia Ravenshaw teachers students afternoon light stairs tailor creak winter',
  'chai pot refills kettle ginger cardamom lemongrass jaggery clay cup saucer steam morning',
  'club Saturday upstairs borrow copy discussion translation Sarala Das Gopinath Mohanty essays',
  'pakhala summer lunch curd rice fried brinjal badi chutney seat cooler shade verandah',
  'orders imports small presses Cuttack Bhubaneswar delivery cycle courier packing brown paper',
]
function distinct(index: number): string {
  const topic = TOPICS[index % TOPICS.length]!
  const words = topic.split(' ')
  const lines: string[] = []
  for (let i = 0; i < 20; i += 1) {
    lines.push(words.map((w) => `${w}${(i * 7 + index) % 13}`).join(' '))
  }
  return lines.join('. ')
}

describe('crawlSite — several pages, not one', () => {
  it('crawls the cap and reports what the cap dropped', async () => {
    const links = [
      'https://chaiandchapters.in/a',
      'https://chaiandchapters.in/b',
      'https://chaiandchapters.in/c',
    ]
    const pages = Object.fromEntries(
      [HOME, ...links].map((url, i) => [url, page(url, distinct(i))] as const),
    )
    const { client: c } = client({ links, pages })

    const out = await crawlSite(HOME, { client: c, maxPages: 2 })

    expect(out.ok).toBe(true)
    if (!out.ok) return
    expect(out.pages).toHaveLength(2)
    // A silent top-N reads as "we crawled your site" when it did not.
    expect(out.skipped).toEqual(['https://chaiandchapters.in/b', 'https://chaiandchapters.in/c'])
    // pages + 1: map bills per CALL, so a scrape-only tally under-reports every
    // signup by one credit. Cost has to be right before it can be shown.
    expect(out.creditsUsed).toBe(3)
  })

  it('bills pages + 1 — the map call is a credit, not free', async () => {
    const links = ['https://chaiandchapters.in/a']
    const pages = Object.fromEntries(
      [HOME, ...links].map((url, i) => [url, page(url, distinct(i))] as const),
    )
    const { client: c } = client({ links, pages })

    const out = await crawlSite(HOME, { client: c, maxPages: 5 })

    expect(out.ok).toBe(true)
    if (!out.ok) return
    expect(out.creditsUsed).toBe(out.pages.length + 1)
  })
})

describe('crawlSite — fails honestly (doc 18 §5)', () => {
  it('no url: not an error, just the door unused', async () => {
    const out = await crawlSite('   ', { client: client({}).client })
    expect(out.ok).toBe(false)
    if (out.ok) return
    expect(out.reason).toBe('no_url')
    expect(out.creditsUsed).toBe(0)
  })

  it('invalid url: says check the address, and spends nothing', async () => {
    const out = await crawlSite('not a website', { client: client({}).client })
    expect(out.ok).toBe(false)
    if (out.ok) return
    expect(out.reason).toBe('invalid_url')
    expect(out.creditsUsed).toBe(0)
  })

  it('unreachable: nothing answered', async () => {
    const { client: c } = client({ pages: { [HOME]: page(HOME, '', 404) } })
    const out = await crawlSite(HOME, { client: c })
    expect(out.ok).toBe(false)
    if (out.ok) return
    expect(out.reason).toBe('unreachable')
    expect(out.message).toMatch(/could not reach/i)
  })

  it('js_only: pages answered 200 and every one was empty — never "your site is empty"', async () => {
    const { client: c } = client({ pages: { [HOME]: page(HOME, '   \n', 200) } })
    const out = await crawlSite(HOME, { client: c })
    expect(out.ok).toBe(false)
    if (out.ok) return
    // The distinction that matters: the site is real, we cannot read it.
    expect(out.reason).toBe('js_only')
    expect(out.message).toMatch(/javascript/i)
    expect(out.message).toMatch(/your own words/i)
  })

  it('thin: real words, too few to be a voice corpus — and says how few it read', async () => {
    const { client: c } = client({ pages: { [HOME]: page(HOME, 'Chai and books. Open daily.') } })
    const out = await crawlSite(HOME, { client: c })
    expect(out.ok).toBe(false)
    if (out.ok) return
    expect(out.reason).toBe('thin')
    expect(out.wordsFound).toBeGreaterThan(0)
    expect(out.message).toMatch(/your own words/i)
  })

  it('crawler_error: OUR failure is never reported as a fact about their website', async () => {
    const refusal = new PageSourceError(402, 'tinyfish', '/fetch')
    const { client: c } = client({ mapThrows: refusal, scrapeThrows: refusal })

    const out = await crawlSite(HOME, { client: c })

    expect(out.ok).toBe(false)
    if (out.ok) return
    expect(out.reason).toBe('crawler_error')
    // Out of credits must not read as "your site is thin" or "unreachable".
    expect(out.message).not.toMatch(/javascript|not enough writing|check the address/i)
  })

  it('every failure falls back to asking, and none invents a voice', async () => {
    const cases: Array<[string, PageSource]> = [
      ['', client({}).client],
      ['nonsense', client({}).client],
      [HOME, client({ pages: { [HOME]: page(HOME, '', 404) } }).client],
      [HOME, client({ pages: { [HOME]: page(HOME, ' ', 200) } }).client],
      [HOME, client({ pages: { [HOME]: page(HOME, 'Tiny site.') } }).client],
    ]
    for (const [url, c] of cases) {
      const out = await crawlSite(url, { client: c })
      expect(out.ok).toBe(false)
      if (out.ok) continue
      expect(out.message).toMatch(/ask|your own words/i)
      expect(out).not.toHaveProperty('pages')
    }
  })
})
