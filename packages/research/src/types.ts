/** A URL discovered on a site, before we decide whether it is worth fetching. */
export interface MappedLink {
  url: string
  title?: string
  description?: string
}

/** One page as a source returned it, before word-counting or classification. */
export interface ScrapedPage {
  url: string
  title: string
  markdown: string
  statusCode: number
}

/**
 * Where pages come from. Three implementations sit behind this, and `crawlSite`
 * cannot tell them apart — which is the point: page selection, the failure
 * taxonomy, word counting and quarantine are written once and every tier gets
 * them.
 *
 *   tier 1  direct    plain fetch + turndown. No vendor, no key, no credits.
 *   tier 2  reader    a free reader service. Fallback on js_only / thin only.
 *   tier 3  firecrawl the paid vendor. Behind a flag, default off.
 */
export interface PageSource {
  /** Named so a report can say which tier produced a corpus. */
  readonly name: string
  /**
   * Vendor credits billed per call. Omitted means 1 (the Firecrawl case, which
   * this interface was extracted from). Tier 1 sets 0 — and 0 must mean zero in
   * the report, not "we forgot to count".
   */
  readonly creditsPerCall?: number
  /** Discover the site's URLs. */
  map(url: string, limit: number): Promise<MappedLink[]>
  /** Fetch one page as markdown. */
  scrape(url: string): Promise<ScrapedPage>
}

/** One page the crawler actually retrieved. */
export interface CrawledPage {
  /** The URL the content came from. Rides with every extracted field as provenance. */
  url: string
  title: string
  /** Markdown, main content only. UNTRUSTED — customer-supplied text. */
  markdown: string
  /** Words in `markdown`, counted once here so thresholds read the same everywhere. */
  words: number
}

/**
 * Why a crawl produced nothing usable. Each arm is a DIFFERENT sentence to the
 * founder, because "we couldn't read your site" and "your site is one image"
 * ask for different things back.
 *
 * There is deliberately no `unknown` arm that shrugs. Doc 18 §14: fail honestly
 * and fall back to asking — never invent a brand voice and present it as
 * extracted. Every arm below routes to the ask, and says why.
 */
export type CrawlFailureReason =
  /** No URL was supplied. Not an error — the URL door simply was not used. */
  | 'no_url'
  /** The URL is not a URL, or not http(s). */
  | 'invalid_url'
  /** Nothing answered: DNS, connection, 4xx/5xx on every candidate page. */
  | 'unreachable'
  /** Pages answered 200 but every one came back with no text — a JS-only site. */
  | 'js_only'
  /** Real text, but not enough of it to be a voice corpus. */
  | 'thin'
  /** Firecrawl itself failed: bad key, out of credits, rate limited, 5xx. */
  | 'crawler_error'

export interface CrawlFailure {
  ok: false
  reason: CrawlFailureReason
  /** Founder-facing, verb-first, and never blames them for having a small site. */
  message: string
  /**
   * URLs this attempt selected, even though it failed. The escalation ladder
   * hands them to tier 2, which reads pages but cannot discover a site — without
   * them a JS-only site would escalate and then read exactly one page.
   */
  attempted: string[]
  /** Pages we managed to fetch, if any — kept so `thin` can say how thin. */
  pagesFetched: number
  wordsFound: number
  /** Firecrawl credits spent even though the outcome was unusable. */
  creditsUsed: number
}

export interface CrawlSuccess {
  ok: true
  pages: CrawledPage[]
  /** Every URL we asked for, including ones that came back empty. */
  attempted: string[]
  /**
   * Pages the map found that we did NOT fetch, because MAX_PAGES capped us. A
   * silent top-N reads as "we crawled your site" when it did not.
   */
  skipped: string[]
  wordsFound: number
  creditsUsed: number
}

export type CrawlOutcome = CrawlSuccess | CrawlFailure

/** Below this, a site is a business card and not a voice corpus. */
export const MIN_CORPUS_WORDS = 150

/**
 * Crawl several pages, not one: a single page yields the CATEGORY's voice, not
 * the company's (doc 18 §5). Capped because Firecrawl bills per page and this
 * runs once per signup — see the cost note in README.
 */
export const MAX_PAGES = 5
