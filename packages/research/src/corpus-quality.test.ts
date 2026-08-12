import { describe, expect, it } from 'vitest'
import { crawlSite, MAX_PER_FAMILY, selectPages } from './crawl-site'
import { htmlToMarkdown } from './html'
import { isNearDuplicate, shingles, similarity } from './similarity'
import type { PageSource, ScrapedPage } from './types'

const HOME = 'https://vallisvaseha.com/'

/**
 * Every case here is drawn from the 2026-08-12 run against five real Indian SMB
 * sites. Fixtures are the shapes those sites actually returned, not invented
 * ones.
 */

// The four variant pages that filled four of five slots, one word apart.
const VARIANT = (shade: string): string =>
  `Unstitched linen material ${shade} shade VVUSM081. Fabric: pure linen, 2.5 metres, dry clean only. ` +
  `Ships within three working days across India. Free delivery above two thousand rupees. ` +
  `Colour may vary slightly from your screen. Exchange within seven days of delivery in original packaging.`

const HOMEPAGE =
  'Vallis Vaseha is a saree store on Amman Koil Street in Vadapalani, Chennai. We weave with ' +
  'families in Kanchipuram and Arni and we name the weaver on every label. Our customers are ' +
  'women buying for a wedding in the family who want something their mother would recognise as ' +
  'proper silk. We do not discount during festival season because the weavers are paid the same ' +
  'in October as in June, and we will tell you when a saree is not right for you.'

describe('near-duplicate detection', () => {
  it('scores four product variants as the same page', () => {
    const grey = shingles(VARIANT('grey'))
    const peach = shingles(VARIANT('peach'))
    expect(similarity(grey, peach)).toBeGreaterThan(0.6)
    expect(isNearDuplicate(peach, [grey])).toBe(true)
  })

  it('leaves genuinely different pages alone', () => {
    expect(isNearDuplicate(shingles(HOMEPAGE), [shingles(VARIANT('grey'))])).toBe(false)
  })

  it('catches a short page wholly contained in a long one', () => {
    const long = shingles(`${HOMEPAGE} ${VARIANT('grey')}`)
    expect(isNearDuplicate(shingles(VARIANT('grey')), [long])).toBe(true)
  })
})

describe('breadth over depth in page selection', () => {
  it('caps one path family so /products cannot spend the whole budget', () => {
    const links = [
      'https://vallisvaseha.com/products/a',
      'https://vallisvaseha.com/products/b',
      'https://vallisvaseha.com/products/c',
      'https://vallisvaseha.com/products/d',
      'https://vallisvaseha.com/about',
      'https://vallisvaseha.com/contact',
    ]
    const selected = selectPages(HOME, links, 5)
    const products = selected.filter((u) => u.includes('/products/'))
    expect(products.length).toBeLessThanOrEqual(MAX_PER_FAMILY)
    // The pages a business writes about itself now make the cut.
    expect(selected).toContain('https://vallisvaseha.com/about')
    expect(selected).toContain('https://vallisvaseha.com/contact')
  })

  it('still fills the budget on a site that only HAS one family', () => {
    const links = Array.from({ length: 8 }, (_, i) => `https://vallisvaseha.com/products/${i}`)
    const selected = selectPages(HOME, links, 5)
    // Breadth is a preference, not a starvation rule — a one-section site is
    // not punished for being small.
    expect(selected).toHaveLength(5)
  })
})

function client(pages: Record<string, string>, links: string[]): PageSource {
  return {
    name: 'fixture',
    creditsPerCall: 0,
    async map() {
      return links.map((url) => ({ url }))
    },
    async scrape(url: string): Promise<ScrapedPage> {
      return { url, title: 't', markdown: pages[url] ?? '', statusCode: 200 }
    },
  }
}

describe('wordsFound counts distinct words, not repeated ones', () => {
  it('discards variant pages and names them, rather than banking their words', async () => {
    const links = ['a', 'b', 'c', 'd'].map((s) => `https://vallisvaseha.com/products/${s}`)
    const pages: Record<string, string> = { [HOME]: HOMEPAGE }
    for (const [i, url] of links.entries())
      pages[url] = VARIANT(['grey', 'peach', 'yellow', 'blue'][i]!)

    // minWords lowered so this test is about DEDUP, not about the threshold.
    const out = await crawlSite(HOME, { client: client(pages, links), maxPages: 5, minWords: 80 })

    expect(out.ok).toBe(true)
    if (!out.ok) return
    // Homepage + at most one variant survives; the rest are named as duplicates.
    expect(out.pages.length).toBeLessThanOrEqual(2)
    expect(out.duplicates.length).toBeGreaterThan(0)
    // "we read five pages" and "five pages were worth reading" are different
    // claims, and only one of them is ours to make.
    expect(out.wordsFound).toBeLessThan(
      HOMEPAGE.split(/\s+/).length + 4 * VARIANT('grey').split(/\s+/).length,
    )
  })

  it('a site that is only repetition now reads THIN, and that is correct', async () => {
    // Before dedup this site banked 4 x 55 words and passed the threshold on
    // one sentence repeated. It now falls back to asking, which is the honest
    // answer: four colours of one blurb is not a voice.
    const links = ['a', 'b', 'c', 'd'].map((s) => `https://vallisvaseha.com/products/${s}`)
    const pages: Record<string, string> = { [HOME]: VARIANT('grey') }
    for (const [i, url] of links.entries())
      pages[url] = VARIANT(['peach', 'yellow', 'blue', 'green'][i]!)

    const out = await crawlSite(HOME, { client: client(pages, links), maxPages: 5 })

    expect(out.ok).toBe(false)
    if (out.ok) return
    expect(out.reason).toBe('thin')
    expect(out.message).toMatch(/your own words/i)
  })
})

describe('chrome stripping', () => {
  it('removes the exact chrome seen on the real sites', () => {
    const md = htmlToMarkdown(`<html><body>
      <div class="skip-link"><a href="#MainContent">Skip to content</a></div>
      <div class="site-header"><a href="javascript:void(0)">top of page</a></div>
      <a href="/customer_authentication/redirect?locale=en">Log in</a>
      <div class="nav-menu"><a href="/x">Home</a></div>
      <p>Odia poetry sits at eye level.</p>
      <div class="site-footer">© 2026</div></body></html>`)

    expect(md).toContain('Odia poetry sits at eye level')
    for (const junk of ['Skip to content', 'top of page', 'Log in', 'javascript:void', '© 2026']) {
      expect(md, junk).not.toContain(junk)
    }
  })

  it("keeps a café's menu — the most brand-specific thing on the page", () => {
    // `menu` is deliberately NOT in the chrome regex. Matching it would strip
    // exactly the copy tier 1 exists to read, and the damage would look like a
    // cleaner corpus.
    const md = htmlToMarkdown(
      '<html><body><div class="menu"><h2>Filter coffee</h2><p>Brewed with chicory, served hot.</p></div></body></html>',
    )
    expect(md).toContain('Filter coffee')
    expect(md).toContain('chicory')
  })

  it('keeps a hero classed as .header, and drops only .site-header', () => {
    const hero = htmlToMarkdown(
      '<html><body><div class="header"><h1>Come hungry</h1></div></body></html>',
    )
    expect(hero).toContain('Come hungry')
    const chrome = htmlToMarkdown(
      '<html><body><div class="site-header">Cart (0)</div></body></html>',
    )
    expect(chrome).not.toContain('Cart')
  })

  it('drops aria-hidden and ARIA landmark chrome', () => {
    const md = htmlToMarkdown(`<html><body>
      <div aria-hidden="true">decorative</div>
      <div role="navigation">Shop All</div>
      <p>Real copy.</p></body></html>`)
    expect(md).toContain('Real copy')
    expect(md).not.toContain('decorative')
    expect(md).not.toContain('Shop All')
  })
})
