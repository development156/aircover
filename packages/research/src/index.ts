// @sahoda/research — the URL door (doc 18 §5). TinyFish Fetch is a DIRECT
// vendor integration with its own key, not a mesh route: OpenRouter routes
// inference, and routing a fetch through it would make a crawl failure look
// like a model failure. Server-side only.
//
// This package acquires and quarantines. It never calls a model — the
// quarantined extraction is `brand_extract` in @sahoda/mesh, which is where
// every model call in this codebase lives.
export const RESEARCH_PACKAGE = '@sahoda/research' as const

// Tier 3 — TinyFish Fetch: free, rendered, residential; behind a flag.
export { createTinyFishSource, TINYFISH_SOURCE_NAME } from './tinyfish'
export type { TinyFishOptions, FetchLike } from './tinyfish'
export { PageSourceError, isVendorRefusal } from './vendor-error'

export { crawlSite, selectPages, countWords, MAX_PER_FAMILY } from './crawl-site'
export { shingles, similarity, isNearDuplicate, NEAR_DUPLICATE_THRESHOLD } from './similarity'
export { stripCorpusNoise } from './strip'
export type { CrawlSiteOptions } from './crawl-site'

// Tier 1 — plain fetch + turndown. No vendor, no key, no credits.
export { createDirectSource } from './direct-source'
export type { DirectSourceOptions } from './direct-source'
export { safeFetch, assertPublicUrl, isPrivateAddress, UnsafeUrlError } from './safe-fetch'
export { pinnedFetch } from './pinned-fetch'
export { guardedFetch, createGuardedFetch } from './guarded-fetch'
export { ipLiteral, isPrivateIpv4, isPrivateIpv6, parseIpv4, parseIpv6 } from './ip'
export type { FetchedPage, SafeFetchOptions } from './safe-fetch'
export { parsePage, htmlToMarkdown, extractLinks } from './html'
export type { ParsedPage } from './html'

// Tier 2 — free keyless reader, escalated to only on js_only / thin.
export {
  createReaderSource,
  parseReaderBody,
  servedFromCache,
  ReaderRateLimitError,
  DEFAULT_READER_URL,
  READER_RATE_LIMIT_PER_MIN,
} from './reader-source'
export type { ReaderSourceOptions } from './reader-source'

// The ladder. Tier 3 (TinyFish Fetch) is behind a flag, default off.
export { openSite } from './tiers'
export type { OpenSiteOptions, OpenSiteResult, TierAttempt, TierFlags } from './tiers'

export {
  quarantineCorpus,
  quarantinePage,
  quarantineBlock,
  quarantineInline,
  quarantinePreamble,
  type QuarantineInput,
  neutralize,
  neutralizeCounting,
  type NeutralizedSpan,
  truncate,
  MAX_CHARS_PER_PAGE,
} from './quarantine'

export { MAX_PAGES, MIN_CORPUS_WORDS } from './types'
export type {
  PageSource,
  MappedLink,
  ScrapedPage,
  CrawledPage,
  CrawlOutcome,
  CrawlSuccess,
  CrawlFailure,
  CrawlFailureReason,
} from './types'

export { loadResearchEnv, assertServerOnly, DEFAULT_TINYFISH_FETCH_URL } from './env'
export type { ResearchEnv } from './env'

// ── The knowledge library's ingestion half ───────────────────────────────────
// Pure: chunking and evidence-building need no dependency, no network and no
// filesystem. The PDF reader lives in apps/web because it needs `unpdf`, and
// keeping it out of here keeps this package installable with nothing.
export {
  chunkDocumentText,
  chunkForIngestion,
  normaliseDocumentText,
  CHUNK_TARGET_CHARS,
  CHUNK_MAX_CHARS,
  MAX_EVIDENCE_CHUNKS,
  MAX_CHUNKS_PER_DOCUMENT,
} from './knowledge/chunk'
export type { ChunkRefusal } from './knowledge/chunk'

export { buildEvidenceSet, citationFor } from './knowledge/evidence'
export type {
  EvidenceChunk,
  EvidenceCitation,
  EvidenceSet,
  AddressedSpan,
} from './knowledge/evidence'
