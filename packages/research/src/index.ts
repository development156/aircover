// @sahoda/research — the URL door (doc 18 §5). Firecrawl is a DIRECT vendor
// integration with its own key, not a mesh route: OpenRouter routes inference,
// and routing a scrape through it would make a crawl failure look like a model
// failure. Server-side only.
//
// This package acquires and quarantines. It never calls a model — the
// quarantined extraction is `brand_extract` in @sahoda/mesh, which is where
// every model call in this codebase lives.
export const RESEARCH_PACKAGE = '@sahoda/research' as const

export { createFirecrawlClient, FirecrawlError } from './firecrawl'
export type {
  FirecrawlClient,
  FirecrawlOptions,
  FetchLike,
  MappedLink,
  ScrapedPage,
} from './firecrawl'

export { crawlSite, selectPages, countWords } from './crawl-site'
export type { CrawlSiteOptions } from './crawl-site'

export {
  quarantineCorpus,
  quarantinePage,
  neutralize,
  truncate,
  MAX_CHARS_PER_PAGE,
} from './quarantine'

export { MAX_PAGES, MIN_CORPUS_WORDS } from './types'
export type {
  CrawledPage,
  CrawlOutcome,
  CrawlSuccess,
  CrawlFailure,
  CrawlFailureReason,
} from './types'

export { loadResearchEnv, assertServerOnly, DEFAULT_FIRECRAWL_URL } from './env'
export type { ResearchEnv } from './env'
