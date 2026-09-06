import { DEFAULT_TINYFISH_FETCH_URL } from './env'
import type { MappedLink, PageSource, ScrapedPage } from './types'
import { PageSourceError } from './vendor-error'

/**
 * TIER 3 — TinyFish Fetch, the rendered read for a site our own request cannot
 * read. A DIRECT vendor integration, deliberately not a mesh route: OpenRouter
 * routes inference, and routing a fetch through it would make a crawl failure
 * look like a model failure.
 *
 * ── WHY TINYFISH AND NOT FIRECRAWL (2026-09-06, founder's ruling) ────────────
 * Fetch is free (150 URLs a minute, 1,000 a day, per key), renders JavaScript
 * and routes through residential IPs, so it serves the page a person would
 * see. Firecrawl did the same job for a per-call credit and its key was never
 * present in any environment file: tier 3 had been behind a flag, default off,
 * since it was written. `creditsPerCall` is 0 here and that is the honest
 * figure: the only thing this tier spends is one of the day's 1,000 fetches.
 *
 * ── WHAT IT CANNOT DO ────────────────────────────────────────────────────────
 * There is no site discovery: Fetch takes URLs, it does not find them. `map()`
 * therefore returns nothing and `openSite` wraps this source with the links
 * tier 1 already discovered, exactly as it does for the tier-2 reader. Its
 * proxies cover US, GB, CA, DE, FR, JP and AU, not India, so a site that serves
 * a different page to a foreign visitor reads as that page; tier 1, from our
 * own Mumbai origin, is still tried first for that reason among others.
 *
 * `fetchImpl` is injected so every test in this package runs on fixtures with
 * no network and no key, the pattern packages/publishing uses for transports.
 */
export type FetchLike = (url: string, init: RequestInit) => Promise<Response>

export interface TinyFishOptions {
  apiKey: string
  baseUrl?: string
  fetchImpl?: FetchLike
}

/** One entry of the Fetch API's `results[]`, the fields this tier reads. */
interface FetchResult {
  url?: string
  final_url?: string
  title?: string
  text?: string | Record<string, unknown>
}

interface FetchResponse {
  results?: FetchResult[]
  errors?: Array<{ url?: string; error?: string }>
}

export const TINYFISH_SOURCE_NAME = 'tinyfish'

export function createTinyFishSource(opts: TinyFishOptions): PageSource {
  const base = opts.baseUrl ?? DEFAULT_TINYFISH_FETCH_URL
  const fetchImpl: FetchLike = opts.fetchImpl ?? ((url, init) => fetch(url, init))

  return {
    name: TINYFISH_SOURCE_NAME,
    creditsPerCall: 0,

    async map(): Promise<MappedLink[]> {
      // No discovery endpoint. The ladder fills this from tier 1's links.
      return []
    },

    async scrape(url: string): Promise<ScrapedPage> {
      const res = await fetchImpl(base, {
        method: 'POST',
        headers: {
          // Their contract: the key rides in `X-API-Key`, not a bearer token.
          'x-api-key': opts.apiKey,
          'content-type': 'application/json',
        },
        // `ttl: 0` is a LIVE fetch. Their cache would otherwise hand back a
        // page from an earlier caller, which for a voice corpus is the same
        // defect the tier-2 reader has: a version of the site the founder may
        // have since changed, with nothing in the body saying so.
        body: JSON.stringify({ urls: [url], format: 'markdown', ttl: 0 }),
      })
      if (!res.ok) throw new PageSourceError(res.status, TINYFISH_SOURCE_NAME, '/fetch')

      const body = (await res.json()) as FetchResponse
      const first = body.results?.[0]
      if (!first) {
        // A 200 with the URL in `errors[]` is one page's failure, not the
        // vendor refusing us: report it as an unanswered page (status 0), so
        // the crawl moves to the next URL instead of stopping.
        return { url, title: '', markdown: '', statusCode: 0 }
      }
      const markdown =
        typeof first.text === 'string'
          ? first.text
          : first.text && typeof first.text === 'object'
            ? JSON.stringify(first.text)
            : ''
      return {
        url: first.final_url ?? first.url ?? url,
        title: first.title ?? '',
        markdown,
        // Fetch does not surface the origin's status; a result present with
        // text is the page having answered.
        statusCode: markdown.length > 0 ? 200 : 0,
      }
    },
  }
}
