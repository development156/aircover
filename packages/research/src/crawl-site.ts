import type { FirecrawlClient } from './firecrawl'
import { FirecrawlError } from './firecrawl'
import { MAX_PAGES, MIN_CORPUS_WORDS, type CrawledPage, type CrawlOutcome } from './types'

/**
 * Pages worth a credit, in the order we want them. A voice corpus lives in the
 * pages a business writes ABOUT ITSELF; a privacy policy is a lawyer's voice and
 * a blog index is a list of titles. Ordering is a preference, not a filter — if
 * a site has none of these we still take its first pages.
 */
const PREFERRED = [
  /\/(about|about-us|our-story|story|who-we-are)\b/i,
  /\/(services|what-we-do|offerings|menu|products|shop)\b/i,
  /\/(work|portfolio|case-stud|projects|testimonial|reviews)\b/i,
  /\/(contact|visit|location|hours)\b/i,
]

/** A lawyer's voice, a login wall, or a feed of other people's words. */
const AVOID = /\/(privacy|terms|cookie|legal|login|signin|cart|checkout|tag|category|feed|rss)\b/i

/** Words are counted the same way everywhere so one threshold means one thing. */
export function countWords(markdown: string): number {
  const stripped = markdown
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[#>*_`|-]+/g, ' ')
  return stripped.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length
}

/** Home first, then the pages a business writes about itself, then the rest. */
export function selectPages(homeUrl: string, links: readonly string[], max: number): string[] {
  const seen = new Set<string>()
  const ordered: string[] = []
  const push = (url: string): void => {
    const key = url.replace(/#.*$/, '').replace(/\/$/, '')
    if (seen.has(key) || ordered.length >= max) return
    seen.add(key)
    ordered.push(url)
  }

  push(homeUrl)
  const candidates = links.filter((url) => !AVOID.test(url))
  for (const pattern of PREFERRED) {
    for (const url of candidates) if (pattern.test(url)) push(url)
  }
  for (const url of candidates) push(url)
  return ordered
}

function normalizeUrl(raw: string): string | null {
  const trimmed = raw.trim()
  if (trimmed.length === 0) return null
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
  try {
    const parsed = new URL(withScheme)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null
    if (!parsed.hostname.includes('.')) return null
    return parsed.toString()
  } catch {
    return null
  }
}

export interface CrawlSiteOptions {
  client: FirecrawlClient
  maxPages?: number
  minWords?: number
}

/**
 * The URL door (doc 18 §5). Map the site, pick several pages, scrape them.
 *
 * FAILS HONESTLY. Every unusable outcome returns a named reason and a sentence
 * that falls back to asking — never an invented voice presented as extracted.
 * The three that look alike and are not:
 *   · `unreachable` — nothing answered. Maybe the URL is wrong.
 *   · `js_only`     — pages answered 200 and every one was empty. The site is
 *                     real; we cannot read it. Do not tell them it is empty.
 *   · `thin`        — real words, too few to be a voice corpus.
 * `crawler_error` is OUR failure (bad key, no credits) and must never be
 * reported to a founder as a fact about their website.
 *
 * Map is one call and scrapes are one credit each, so cost is `pages + 1` and is
 * knowable before spend. `skipped` names what the cap dropped — a silent top-N
 * reads as "we crawled your site" when it did not.
 */
export async function crawlSite(rawUrl: string, opts: CrawlSiteOptions): Promise<CrawlOutcome> {
  const maxPages = opts.maxPages ?? MAX_PAGES
  const minWords = opts.minWords ?? MIN_CORPUS_WORDS

  if (rawUrl.trim().length === 0) {
    return {
      ok: false,
      reason: 'no_url',
      message: 'No website to read — we will ask you instead.',
      pagesFetched: 0,
      wordsFound: 0,
      creditsUsed: 0,
    }
  }

  const homeUrl = normalizeUrl(rawUrl)
  if (!homeUrl) {
    return {
      ok: false,
      reason: 'invalid_url',
      message:
        'Check that website address — we could not read it as a link. Or tell us in your own words instead.',
      pagesFetched: 0,
      wordsFound: 0,
      creditsUsed: 0,
    }
  }

  let mapped: string[] = []
  let creditsUsed = 0
  try {
    mapped = (await opts.client.map(homeUrl, maxPages * 4)).map((link) => link.url)
    // Map bills 1 credit PER CALL, not per URL discovered — so the true cost of
    // a crawl is `pages + 1`, and a counter that only tallied scrapes would
    // under-report every signup. Counted on success only: a call that threw
    // cannot be assumed to have billed.
    creditsUsed += 1
  } catch (error) {
    // A map failure is not proof the site is unreadable — fall through and try
    // the home page directly. Only a Firecrawl-side refusal (402/429) stops us.
    if (error instanceof FirecrawlError && (error.status === 402 || error.status === 429)) {
      return {
        ok: false,
        reason: 'crawler_error',
        message: 'Could not read your website just now — we will ask you instead.',
        pagesFetched: 0,
        wordsFound: 0,
        creditsUsed: 0,
      }
    }
  }

  const selected = selectPages(homeUrl, mapped, maxPages)
  const skipped = mapped.filter((url) => !selected.includes(url))

  const pages: CrawledPage[] = []
  let answered = 0
  let crawlerRefused = false

  for (const url of selected) {
    try {
      const page = await opts.client.scrape(url)
      creditsUsed += 1
      // A 2xx with no text is the JS-only signature; a 4xx/5xx never answered.
      if (page.statusCode >= 200 && page.statusCode < 400) answered += 1
      const words = countWords(page.markdown)
      if (words > 0) {
        pages.push({ url: page.url, title: page.title, markdown: page.markdown, words })
      }
    } catch (error) {
      if (error instanceof FirecrawlError && (error.status === 402 || error.status === 429)) {
        crawlerRefused = true
        break
      }
      // A single page failing is ordinary; keep going and judge on the total.
    }
  }

  const wordsFound = pages.reduce((sum, page) => sum + page.words, 0)

  if (crawlerRefused && pages.length === 0) {
    return {
      ok: false,
      reason: 'crawler_error',
      message: 'Could not read your website just now — we will ask you instead.',
      pagesFetched: 0,
      wordsFound: 0,
      creditsUsed,
    }
  }

  if (pages.length === 0) {
    const jsOnly = answered > 0
    return {
      ok: false,
      reason: jsOnly ? 'js_only' : 'unreachable',
      message: jsOnly
        ? 'Your site loads its text with JavaScript, so we could not read it — tell us in your own words instead.'
        : 'Could not reach that website — check the address, or tell us in your own words instead.',
      pagesFetched: 0,
      wordsFound: 0,
      creditsUsed,
    }
  }

  if (wordsFound < minWords) {
    return {
      ok: false,
      reason: 'thin',
      message: `Read ${pages.length} page${pages.length === 1 ? '' : 's'}, but there was not enough writing to learn your voice — tell us in your own words instead.`,
      pagesFetched: pages.length,
      wordsFound,
      creditsUsed,
    }
  }

  return { ok: true, pages, attempted: selected, skipped, wordsFound, creditsUsed }
}
