import { extractLinks, parsePage } from './html'
import { safeFetch, type SafeFetchOptions } from './safe-fetch'
import type { MappedLink, PageSource, ScrapedPage } from './types'

/**
 * TIER 1 — plain `fetch()` plus HTML→markdown. No vendor, no key, no credits.
 *
 * There is no sitemap call here and that is deliberate: `map()` fetches the
 * HOME PAGE and reads its same-origin anchors. An SMB site's navigation is a
 * better guide to what a business says about itself than a generated sitemap,
 * which on WordPress happily lists two hundred tag archives. It also means map
 * costs one fetch that is not wasted — the home page's markdown is cached and
 * reused when `scrape()` is asked for it a moment later, so a five-page crawl
 * is five HTTP requests, not six.
 *
 * `statusCode` is the REAL status off the response. That matters more than it
 * looks: `crawlSite` reads it to tell `js_only` (answered, empty) from
 * `unreachable` (never answered), and `js_only` is the signal that escalates to
 * tier 2. A defaulted 0 here would make every empty page look unreachable and
 * the whole fallback would be dead code.
 */
export interface DirectSourceOptions extends SafeFetchOptions {
  /** Shared across map+scrape so the home page is fetched once, not twice. */
  cache?: Map<string, ScrapedPage>
}

export function createDirectSource(opts: DirectSourceOptions = {}): PageSource {
  const cache = opts.cache ?? new Map<string, ScrapedPage>()

  async function fetchAsPage(url: string): Promise<ScrapedPage> {
    const cached = cache.get(url)
    if (cached) return cached

    const res = await safeFetch(url, opts)
    const parsed = parsePage(res.html, res.url)
    const page: ScrapedPage = {
      url: res.url,
      title: parsed.title,
      markdown: parsed.markdown,
      statusCode: res.status,
    }
    cache.set(url, page)
    // A redirect means the final URL differs from the one asked for; cache both
    // so a later scrape of either spelling is free.
    if (res.url !== url) cache.set(res.url, page)
    return page
  }

  return {
    name: 'direct',
    creditsPerCall: 0,

    async map(url: string): Promise<MappedLink[]> {
      const res = await safeFetch(url, opts)
      // Populate the cache with what we just paid a request for.
      const parsed = parsePage(res.html, res.url)
      cache.set(url, {
        url: res.url,
        title: parsed.title,
        markdown: parsed.markdown,
        statusCode: res.status,
      })
      return extractLinks(res.html, res.url).map((link) => ({ url: link }))
    },

    scrape: fetchAsPage,
  }
}
