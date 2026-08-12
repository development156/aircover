import { crawlSite } from './crawl-site'
import { createDirectSource, type DirectSourceOptions } from './direct-source'
import { createFirecrawlClient } from './firecrawl'
import { createReaderSource } from './reader-source'
import type { CrawlFailureReason, CrawlOutcome, PageSource } from './types'

/**
 * The escalation ladder.
 *
 *   tier 1  direct     plain fetch + turndown. Always tried first. Free.
 *   tier 2  reader     free reader service. ONLY on js_only / thin. DEFAULT OFF —
 *                      cached snapshots and third-party disclosure, not cost.
 *   tier 3  firecrawl  the paid vendor. Behind a flag, DEFAULT OFF.
 *
 * The flag lives here rather than inside `crawlSite` or the Firecrawl client on
 * purpose: the vendor client stays exactly as it was, so its committed tests
 * keep meaning what they meant, and the decision about who gets called sits in
 * one readable place.
 *
 * ESCALATE ONLY ON js_only AND thin. Those two mean "there is a site and we
 * could not read enough of it" — the only condition another reader can fix.
 * `unreachable` means nothing answered, and paying a vendor to also get nothing
 * is spending money to learn what we know. `invalid_url` and `no_url` are the
 * founder's typo and the door being unused. `crawler_error` is ours.
 */
const ESCALATES: ReadonlySet<CrawlFailureReason> = new Set<CrawlFailureReason>(['js_only', 'thin'])

export interface TierFlags {
  /**
   * Tier 2. DEFAULT OFF — and not for cost, since it is free and keyless. Two
   * reasons, both about truth rather than money:
   *   · it can serve a CACHED SNAPSHOT (observed: "Warning: This is a cached
   *     snapshot of the original page"), so a voice corpus may come from a
   *     version of the site the founder has since changed, and the body does not
   *     reliably say which we got;
   *   · it discloses a customer's URL to a third party. Tier 1 does not.
   * Opt in per call when those are acceptable.
   */
  reader?: boolean
  /** Tier 3. Default OFF — it is the only tier that spends money. */
  firecrawl?: boolean
}

export interface OpenSiteOptions {
  flags?: TierFlags
  maxPages?: number
  minWords?: number
  direct?: DirectSourceOptions
  reader?: { baseUrl?: string; apiKey?: string; fetchImpl?: typeof fetch }
  firecrawl?: { apiKey: string; baseUrl?: string; fetchImpl?: typeof fetch }
  /** Injected in tests. Replaces the whole ladder's source construction. */
  sources?: { direct?: PageSource; reader?: PageSource; firecrawl?: PageSource }
}

export interface TierAttempt {
  tier: 1 | 2 | 3
  source: string
  ok: boolean
  reason?: CrawlFailureReason
  wordsFound: number
  creditsUsed: number
}

export interface OpenSiteResult {
  outcome: CrawlOutcome
  /** Every tier tried, in order — so a report can say what it took, and what it cost. */
  attempts: TierAttempt[]
  /** Which tier produced the outcome, or null when all of them failed. */
  servedBy: 1 | 2 | 3 | null
  /** Vendor credits across the whole ladder. Zero unless tier 3 ran. */
  creditsUsed: number
}

/**
 * Read a site, cheapest first. Returns the first usable corpus, or the LAST
 * failure — which is deliberate: the last failure is the most informed one, and
 * if tier 2 tried and still found nothing, "your site loads its text with
 * JavaScript" is a better sentence than tier 1's identical guess.
 */
export async function openSite(
  rawUrl: string,
  opts: OpenSiteOptions = {},
): Promise<OpenSiteResult> {
  const flags = { reader: false, firecrawl: false, ...opts.flags }
  const attempts: TierAttempt[] = []
  let creditsUsed = 0

  const direct = opts.sources?.direct ?? createDirectSource(opts.direct ?? {})
  const first = await crawlSite(rawUrl, {
    client: direct,
    maxPages: opts.maxPages,
    minWords: opts.minWords,
  })
  attempts.push(toAttempt(1, direct.name, first))
  creditsUsed += first.creditsUsed
  if (first.ok) return { outcome: first, attempts, servedBy: 1, creditsUsed }

  if (!ESCALATES.has(first.reason)) {
    return { outcome: first, attempts, servedBy: null, creditsUsed }
  }

  // Hand tier 1's discovered links forward. The reader returns text, not HTML,
  // so it cannot discover a site on its own — without this a JS-only site would
  // escalate and then read exactly one page. Applied as a WRAPPER rather than a
  // constructor argument so it holds for any tier-2 source, including one
  // injected by a test: a mechanism that only works on the real implementation
  // is a mechanism nothing can check.
  const knownLinks = first.attempted

  let last: CrawlOutcome = first

  if (flags.reader) {
    const reader = withFallbackLinks(
      opts.sources?.reader ?? createReaderSource(opts.reader ?? {}),
      knownLinks,
    )
    const second = await crawlSite(rawUrl, {
      client: reader,
      maxPages: opts.maxPages,
      minWords: opts.minWords,
    })
    attempts.push(toAttempt(2, reader.name, second))
    creditsUsed += second.creditsUsed
    if (second.ok) return { outcome: second, attempts, servedBy: 2, creditsUsed }
    last = second
  }

  if (flags.firecrawl) {
    const vendor =
      opts.sources?.firecrawl ??
      (opts.firecrawl ? createFirecrawlClient(opts.firecrawl) : undefined)
    if (vendor) {
      const third = await crawlSite(rawUrl, {
        client: vendor,
        maxPages: opts.maxPages,
        minWords: opts.minWords,
      })
      attempts.push(toAttempt(3, vendor.name, third))
      creditsUsed += third.creditsUsed
      if (third.ok) return { outcome: third, attempts, servedBy: 3, creditsUsed }
      last = third
    }
  }

  return { outcome: last, attempts, servedBy: null, creditsUsed }
}

/**
 * Give a source that cannot discover a site the URLs another tier already found.
 * Its own `map` still wins when it returns anything — this only fills a blank.
 */
function withFallbackLinks(source: PageSource, links: readonly string[]): PageSource {
  return {
    ...source,
    async map(url: string, limit: number) {
      const own = await source.map(url, limit)
      if (own.length > 0) return own
      return links.map((link) => ({ url: link }))
    },
    scrape: (url: string) => source.scrape(url),
  }
}

function toAttempt(tier: 1 | 2 | 3, source: string, outcome: CrawlOutcome): TierAttempt {
  return {
    tier,
    source,
    ok: outcome.ok,
    ...(outcome.ok ? {} : { reason: outcome.reason }),
    wordsFound: outcome.wordsFound,
    creditsUsed: outcome.creditsUsed,
  }
}
