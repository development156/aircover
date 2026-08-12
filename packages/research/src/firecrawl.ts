import { DEFAULT_FIRECRAWL_URL } from './env'

/**
 * A DIRECT Firecrawl integration — deliberately not a mesh route.
 *
 * doc 18 opens by correcting exactly this: OpenRouter routes LLM inference and
 * offers web *search* via a plugin; Firecrawl's crawl/scrape/extract are a
 * separate service with its own API and its own key. Routing them through the
 * Model Mesh would make a scraping failure look like a model failure, and would
 * bill a fixed credit price against a per-call vendor cost.
 *
 * `fetchImpl` is injected so every test in this package runs on fixtures with no
 * network and no key — the same pattern packages/publishing uses for transports.
 */
export type FetchLike = (url: string, init: RequestInit) => Promise<Response>

export interface FirecrawlOptions {
  apiKey: string
  baseUrl?: string
  fetchImpl?: FetchLike
}

/** A Firecrawl call that failed. Carries the HTTP status only — never the key. */
export class FirecrawlError extends Error {
  constructor(
    readonly status: number,
    readonly endpoint: string,
  ) {
    super(`firecrawl ${endpoint} failed with HTTP ${status}`)
    this.name = 'FirecrawlError'
  }
}

export interface MappedLink {
  url: string
  title?: string
  description?: string
}

export interface ScrapedPage {
  url: string
  title: string
  markdown: string
  statusCode: number
}

interface MapResponse {
  success?: boolean
  // v2 returns objects; older shapes returned bare strings. Both are normalised.
  links?: Array<string | { url?: string; title?: string; description?: string }>
}

interface ScrapeResponse {
  success?: boolean
  data?: {
    markdown?: string
    metadata?: {
      title?: string | string[]
      sourceURL?: string
      url?: string
      statusCode?: number
    }
  }
}

/** Firecrawl's metadata fields are `string | string[]`; take the first. */
function firstString(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? ''
  return value ?? ''
}

export interface FirecrawlClient {
  /** Discover the site's URLs without spending a scrape credit on each. */
  map(url: string, limit: number): Promise<MappedLink[]>
  /** Fetch one page as markdown. Costs one Firecrawl credit. */
  scrape(url: string): Promise<ScrapedPage>
}

const SCRAPE_TIMEOUT_MS = 30_000

export function createFirecrawlClient(opts: FirecrawlOptions): FirecrawlClient {
  const base = opts.baseUrl ?? DEFAULT_FIRECRAWL_URL
  const fetchImpl: FetchLike = opts.fetchImpl ?? ((url, init) => fetch(url, init))

  async function post<T>(endpoint: string, body: unknown): Promise<T> {
    const res = await fetchImpl(`${base}${endpoint}`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${opts.apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
    })
    // Assert on content, not on the status alone — but a non-2xx here carries no
    // usable body, and 402 (out of credits) must not read as an empty site.
    if (!res.ok) throw new FirecrawlError(res.status, endpoint)
    return (await res.json()) as T
  }

  return {
    async map(url: string, limit: number): Promise<MappedLink[]> {
      // `includeSubdomains` DEFAULTS TO TRUE. Left alone, a sitemap that
      // references shop.example.com or a CDN host would spend our credits on
      // pages the founder may not own — and land them in the corpus carrying a
      // source_url that reads as their own authoritative provenance.
      const body = await post<MapResponse>('/map', {
        url,
        limit,
        sitemap: 'include',
        includeSubdomains: false,
      })
      return (body.links ?? [])
        .map((link) =>
          typeof link === 'string' ? { url: link } : { ...link, url: link.url ?? '' },
        )
        .filter((link): link is MappedLink => link.url.length > 0)
    },

    async scrape(url: string): Promise<ScrapedPage> {
      const body = await post<ScrapeResponse>('/scrape', {
        url,
        formats: ['markdown'],
        onlyMainContent: true,
        timeout: SCRAPE_TIMEOUT_MS,
      })
      const data = body.data ?? {}
      const meta = data.metadata ?? {}
      return {
        url: meta.url ?? meta.sourceURL ?? url,
        title: firstString(meta.title),
        markdown: data.markdown ?? '',
        statusCode: meta.statusCode ?? 0,
      }
    },
  }
}
