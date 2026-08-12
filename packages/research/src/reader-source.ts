import type { MappedLink, PageSource, ScrapedPage } from './types'

/**
 * TIER 2 — a free reader service that renders the page and returns markdown.
 *
 * Triggered ONLY by tier 1's `js_only` and `thin` signals. It exists for the
 * site tier 1 can see but cannot read: a React/Wix/Squarespace shell whose text
 * arrives after JavaScript runs.
 *
 * MEASURED, NOT ASSUMED (2026-08-12, keyless):
 *   · works with no key at all — HTTP 200 on both probes
 *   · `x-ratelimit-limit: 20, 20;w=60` → 20 requests per 60 seconds, and that
 *     budget is SHARED across our whole deployment, not per signup. Five pages
 *     is fine for one founder and four concurrent signups exhausts it.
 *   · the response can be a CACHED SNAPSHOT — example.com came back with
 *     "Warning: This is a cached snapshot of the original page". For a voice
 *     corpus that means we may extract from a version of the site the founder
 *     has since changed, and we cannot tell from the body which we got.
 *
 * PRIVACY: this hands a customer's URL to a third party. Tier 1 does not. That
 * is a real difference and it is why the ladder tries tier 1 first rather than
 * calling the fastest thing.
 *
 * The service returns text, not HTML, so there are no links to follow: `map`
 * returns nothing. That is the honest behaviour — tier 2 reads a page, it does
 * not discover a site. The ladder fills the gap with the links tier 1 found, so
 * a JS-only site still gets several pages.
 */

export const DEFAULT_READER_URL = 'https://r.jina.ai'
/** Their published keyless budget. Kept as a constant so the report can cite it. */
export const READER_RATE_LIMIT_PER_MIN = 20

export interface ReaderSourceOptions {
  baseUrl?: string
  /** Optional: a key raises their rate limit. Absent is the supported case. */
  apiKey?: string
  timeoutMs?: number
  fetchImpl?: typeof fetch
}

const DEFAULT_TIMEOUT_MS = 45_000

/** Reader output is prose with a small header block; lift the title out of it. */
export function parseReaderBody(body: string): { title: string; markdown: string } {
  const title = /^Title:\s*(.+)$/m.exec(body)?.[1]?.trim() ?? ''
  // Everything from the "Markdown Content:" marker onward is the page itself.
  const marker = body.indexOf('Markdown Content:')
  const markdown =
    marker >= 0 ? body.slice(marker + 'Markdown Content:'.length).trim() : body.trim()
  return { title, markdown }
}

/** True when the service told us it served a cache rather than a live read. */
export function servedFromCache(body: string): boolean {
  return /Warning:\s*This is a cached snapshot/i.test(body)
}

export function createReaderSource(opts: ReaderSourceOptions = {}): PageSource {
  const base = (opts.baseUrl ?? DEFAULT_READER_URL).replace(/\/$/, '')
  const doFetch = opts.fetchImpl ?? fetch

  return {
    name: 'reader',
    creditsPerCall: 0,

    // The service returns text, not HTML — there is nothing to discover from.
    // The ladder fills this in with the links tier 1 found (see withFallbackLinks).
    async map(): Promise<MappedLink[]> {
      return []
    },

    async scrape(url: string): Promise<ScrapedPage> {
      const res = await doFetch(`${base}/${url}`, {
        headers: {
          accept: 'text/plain',
          ...(opts.apiKey ? { authorization: `Bearer ${opts.apiKey}` } : {}),
        },
        signal: AbortSignal.timeout(opts.timeoutMs ?? DEFAULT_TIMEOUT_MS),
      })

      // A 429 here is OUR shared budget running out, not a fact about their
      // site. Surfacing it as an empty page would make crawlSite report
      // `js_only` — our rate limit dressed up as their broken website.
      if (res.status === 429) {
        throw new ReaderRateLimitError(READER_RATE_LIMIT_PER_MIN)
      }

      const body = res.ok ? await res.text() : ''
      const { title, markdown } = parseReaderBody(body)
      return { url, title, markdown, statusCode: res.status }
    },
  }
}

export class ReaderRateLimitError extends Error {
  constructor(readonly perMinute: number) {
    super(`reader service rate limit reached (${perMinute}/min, shared)`)
    this.name = 'ReaderRateLimitError'
  }
}
