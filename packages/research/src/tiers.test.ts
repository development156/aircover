import { describe, expect, it } from 'vitest'
import { extractLinks, htmlToMarkdown, parsePage } from './html'
import { parseReaderBody, servedFromCache } from './reader-source'
import { openSite } from './tiers'
import type { PageSource, ScrapedPage } from './types'

const HOME = 'https://chaiandchapters.in/'

const PROSE = `A two-room bookshop off a Buxi Bazaar side street where Odia poetry sits at eye
level. The reading room upstairs is never rushed and a seat costs nothing. Our readers are
Ravenshaw students and school teachers who grew up on Odia poetry and now mostly buy English
fiction, because Odia titles are hard to find in the city and the online sellers do not stock
them at all. Book club meets Saturday at five upstairs; bring your copy or borrow ours.
Pakhala from May, same seat, cooler lunch. We only recommend what we have read, and Odia
writing gets the front shelf every single week of the year, without exception, here.
The shop opened in the winter of two thousand and nine above a tailor who still works
downstairs, and the stairs creak in a way regulars have stopped noticing. We stock small
Odia presses nobody else carries, we order anything we do not have, and we will tell you
honestly when a book is not worth your money. Tea is by the pot and refills are free until
you leave. Nobody is asked to buy anything to sit down, and nobody ever has been.`

/** A source that answers 200 with whatever markdown it is given. */
function source(
  name: string,
  pages: Record<string, string>,
  links: string[] = [],
  perCall = 0,
): PageSource & { calls: string[] } {
  const calls: string[] = []
  return {
    name,
    creditsPerCall: perCall,
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

describe('html → markdown', () => {
  it('drops chrome from the parsed tree, keeps the copy', () => {
    const md = htmlToMarkdown(
      `<html><head><style>a{}</style></head><body>
       <nav><a href="/x">Home</a></nav>
       <h1>Chai &amp; Chapters</h1><p>Odia poetry, <b>front shelf</b>.</p>
       <script>alert(1)</script><footer>© 2026</footer></body></html>`,
    )
    expect(md).toContain('Chai & Chapters')
    expect(md).toContain('**front shelf**')
    expect(md).not.toContain('alert(1)')
    expect(md).not.toContain('© 2026')
  })

  it('returns empty for a JS-only shell — the signal that escalates to tier 2', () => {
    const md = htmlToMarkdown(
      '<html><body><div id="root"></div><script src="/app.js"></script></body></html>',
    )
    expect(md).toBe('')
  })

  it('reads the title and only same-origin links', () => {
    const parsed = parsePage(
      `<html><head><title>Chai &amp; Chapters</title></head><body>
       <a href="/about">About</a><a href="https://facebook.com/x">FB</a>
       <a href="mailto:a@b.c">Mail</a><a href="#top">Top</a>
       <a href="https://chaiandchapters.in/menu">Menu</a></body></html>`,
      HOME,
    )
    expect(parsed.title).toBe('Chai & Chapters')
    expect(parsed.links).toEqual([
      'https://chaiandchapters.in/about',
      'https://chaiandchapters.in/menu',
    ])
  })

  it('bounds link extraction so a huge page cannot dominate a signup', () => {
    const many = Array.from({ length: 5000 }, (_, i) => `<a href="/p${i}">p</a>`).join('')
    expect(extractLinks(`<html><body>${many}</body></html>`, HOME).length).toBeLessThanOrEqual(300)
  })
})

describe('reader response parsing (tier 2)', () => {
  it('lifts the title and the body out of the reader envelope', () => {
    const body =
      'Title: Home | X\n\nURL Source: https://x.in/\n\nMarkdown Content:\n## Hello\n\nText.'
    const parsed = parseReaderBody(body)
    expect(parsed.title).toBe('Home | X')
    expect(parsed.markdown).toBe('## Hello\n\nText.')
  })

  it('detects the cached-snapshot warning — a stale corpus is a stale brand', () => {
    expect(
      servedFromCache('Title: X\n\nWarning: This is a cached snapshot of the original page\n'),
    ).toBe(true)
    expect(servedFromCache('Title: X\n\nMarkdown Content:\nfresh')).toBe(false)
  })
})

describe('the escalation ladder', () => {
  it('serves from tier 1 and never touches a vendor when the site is readable', async () => {
    const direct = source('direct', { [HOME]: PROSE })
    const reader = source('reader', { [HOME]: PROSE })
    const firecrawl = source('firecrawl', { [HOME]: PROSE }, [], 1)

    const result = await openSite(HOME, {
      sources: { direct, reader, firecrawl },
      flags: { reader: true, firecrawl: true },
    })

    expect(result.servedBy).toBe(1)
    expect(result.creditsUsed).toBe(0)
    expect(reader.calls).toEqual([])
    expect(firecrawl.calls).toEqual([])
  })

  it('escalates to tier 2 on js_only, and reads the pages tier 1 discovered', async () => {
    const links = ['https://chaiandchapters.in/about']
    // Tier 1 answers 200 with nothing — the JS-only signature.
    const direct = source('direct', {}, links)
    const reader = source('reader', { [HOME]: PROSE, [links[0]!]: PROSE })

    const result = await openSite(HOME, { sources: { direct, reader }, flags: { reader: true } })

    expect(result.attempts[0]).toMatchObject({ tier: 1, ok: false, reason: 'js_only' })
    expect(result.servedBy).toBe(2)
    // Tier 1's links were handed forward, so the escalation read several pages.
    expect(reader.calls).toContain(links[0])
  })

  it('escalates on thin as well as js_only', async () => {
    const direct = source('direct', { [HOME]: 'Chai and books. Open daily.' })
    const reader = source('reader', { [HOME]: PROSE })
    const result = await openSite(HOME, {
      sources: { direct, reader },
      flags: { reader: true },
    })
    expect(result.attempts[0]!.reason).toBe('thin')
    expect(result.servedBy).toBe(2)
  })

  it('does NOT escalate on unreachable — paying to also get nothing is spending to learn nothing', async () => {
    const direct: PageSource = {
      name: 'direct',
      creditsPerCall: 0,
      async map() {
        return []
      },
      async scrape(url) {
        return { url, title: '', markdown: '', statusCode: 0 }
      },
    }
    const reader = source('reader', { [HOME]: PROSE })
    const firecrawl = source('firecrawl', { [HOME]: PROSE }, [], 1)

    const result = await openSite(HOME, {
      sources: { direct, reader, firecrawl },
      flags: { reader: true, firecrawl: true },
    })

    expect(result.attempts[0]!.reason).toBe('unreachable')
    expect(result.attempts).toHaveLength(1)
    expect(reader.calls).toEqual([])
    expect(firecrawl.calls).toEqual([])
    expect(result.creditsUsed).toBe(0)
  })

  it('leaves BOTH tier 2 and tier 3 off by default — one tier runs unless asked', async () => {
    const direct = source('direct', {}, [])
    const reader = source('reader', {}, [])
    const firecrawl = source('firecrawl', { [HOME]: PROSE }, [], 1)

    const result = await openSite(HOME, { sources: { direct, reader, firecrawl } })

    expect(reader.calls).toEqual([])
    expect(firecrawl.calls).toEqual([])
    expect(result.servedBy).toBeNull()
    expect(result.creditsUsed).toBe(0)
    // Was [1, 2] while tier 2 defaulted on. Updated, not deleted: the default
    // moved deliberately (cached snapshots + third-party disclosure).
    expect(result.attempts.map((a) => a.tier)).toEqual([1])
  })

  it('uses tier 3 only when its flag is explicitly on, and bills only then', async () => {
    const direct = source('direct', {}, [])
    const reader = source('reader', {}, [])
    const firecrawl = source('firecrawl', { [HOME]: PROSE }, [], 1)

    const result = await openSite(HOME, {
      sources: { direct, reader, firecrawl },
      flags: { reader: true, firecrawl: true },
    })

    expect(result.servedBy).toBe(3)
    // map + one scrape, at one credit each — and zero from tiers 1 and 2.
    expect(result.creditsUsed).toBe(2)
  })

  it('returns the LAST failure, which is the most informed one', async () => {
    const direct = source('direct', {}, [])
    const reader = source('reader', {}, [])
    const result = await openSite(HOME, { sources: { direct, reader }, flags: { reader: true } })
    expect(result.outcome.ok).toBe(false)
    if (result.outcome.ok) return
    expect(result.attempts).toHaveLength(2)
    expect(result.outcome.message).toMatch(/ask|your own words/i)
  })
})
