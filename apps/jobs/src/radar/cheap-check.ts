import { createHash } from 'node:crypto'

import { normalizePageText } from '@sahoda/shared'

/**
 * THE CHEAP CHECK — finding out whether a page moved, without paying to read it.
 *
 * A competitor's pricing page changes perhaps monthly. Rendering it every night
 * pays full price, thirty times a month, for "nothing happened". So the night
 * starts with a conditional GET from our own server: we hand back the ETag the
 * site gave us last time, and a site that has not changed answers 304 with no
 * body at all. Where there is no ETag we fetch and compare a hash.
 *
 * ── THE TRAP THIS FILE IS SHAPED AROUND ──────────────────────────────────────
 * A datacenter IP gets bot-challenged by a real fraction of websites, and a
 * challenge is served with HTTP 200. A challenge page hashes PERFECTLY STABLY —
 * it is the same interstitial every time. So a checker that only compares hashes
 * would report "nothing changed" every single day, forever, while never once
 * having seen the site. That is a silent false negative wearing a perfect hit
 * rate, and it is the single most likely way this feature would quietly stop
 * working while every dashboard said it was fine.
 *
 * Hence: CLASSIFY BEFORE HASHING, and three outcomes, never two.
 *
 *     unchanged        we looked and it is the same
 *     changed          we looked and it moved
 *     could_not_check  we did not manage to look    ← A GAP, and it says so
 *
 * "We could not check" and "nothing happened" are different facts. Collapsing
 * them is the one thing this file must not do.
 */

export interface CheapCheckMemory {
  etag: string | null
  lastModified: string | null
  contentHash: string | null
}

export type CheapCheckResult =
  | { outcome: 'unchanged'; via: '304' | 'hash'; memory: CheapCheckMemory }
  | {
      outcome: 'changed'
      html: string
      text: string
      contentHash: string
      finalUrl: string
      memory: CheapCheckMemory
    }
  | { outcome: 'could_not_check'; why: string; escalate: boolean }

/** Injected so the whole file is testable without a network. */
export type FetchLike = (url: string, init: RequestInit) => Promise<Response>

export const RADAR_USER_AGENT =
  'Mozilla/5.0 (compatible; SahodaRadar/1.0; +https://sahoda.site/radar) AppleWebKit/537.36'

export function contentHashOf(text: string): string {
  return createHash('sha256').update(text).digest('hex')
}

/**
 * Is this 200 a bot wall rather than the site?
 *
 * Deliberately conservative: it looks for the interstitials' own markers, never
 * for "the page seems short". A genuinely small homepage — and small business
 * homepages are often very small — must not be misfiled as blocked, because a
 * source wrongly marked `could_not_check` costs a paid render every night.
 */
export function detectChallenge(html: string, headers: Headers): string | null {
  const head = html.slice(0, 4000).toLowerCase()
  if (headers.get('cf-mitigated') === 'challenge') return 'cloudflare (cf-mitigated header)'
  if (head.includes('cf-browser-verification')) return 'cloudflare jschl'
  if (head.includes('/cdn-cgi/challenge-platform')) return 'cloudflare challenge platform'
  if (head.includes('just a moment')) return 'cloudflare interstitial'
  if (head.includes('enable javascript and cookies to continue')) return 'cloudflare interstitial'
  if (head.includes('checking your browser before accessing')) return 'cloudflare interstitial'
  if (head.includes('px-captcha') || head.includes('perimeterx')) return 'perimeterx'
  if (head.includes('incapsula incident id')) return 'imperva'
  if (head.includes('are you a robot') || head.includes('access denied')) return 'generic bot wall'
  return null
}

/**
 * A page with almost no words is usually a shell that needs JavaScript, not a
 * page with nothing on it. Treated as a gap rather than as "they emptied their
 * site", and escalated, because a render is exactly what would fix it.
 */
const MIN_WORDS = 20

export interface CheapCheckOptions {
  url: string
  memory: CheapCheckMemory
  fetch: FetchLike
  timeoutMs?: number
}

export async function cheapCheck(options: CheapCheckOptions): Promise<CheapCheckResult> {
  const { url, memory, timeoutMs = 25_000 } = options

  const headers: Record<string, string> = {
    'user-agent': RADAR_USER_AGENT,
    accept: 'text/html,application/xhtml+xml',
  }
  // The two validators that make a 304 possible. Handing back what the server
  // itself gave us is the entire reason this check can cost nothing.
  if (memory.etag) headers['if-none-match'] = memory.etag
  if (memory.lastModified) headers['if-modified-since'] = memory.lastModified

  let res: Response
  try {
    res = await options.fetch(url, {
      headers,
      redirect: 'follow',
      signal: AbortSignal.timeout(timeoutMs),
    })
  } catch (error) {
    const name = error instanceof Error ? error.name : 'Error'
    // A transport failure is a gap, and escalating would spend money on a host
    // that did not answer us at all — which a proxy is unlikely to change.
    return { outcome: 'could_not_check', why: `transport: ${name}`, escalate: false }
  }

  if (res.status === 304) {
    // The cheapest possible answer: the server says nothing moved, and sent no
    // body to prove it. Memory is unchanged — the validators are still current.
    return { outcome: 'unchanged', via: '304', memory }
  }

  if (!res.ok) {
    // 403 and 429 are the shapes a bot wall takes when it does not bother with an
    // interstitial. Those are worth a paid fetch; a 404 or a 500 is not.
    const escalate = res.status === 403 || res.status === 429 || res.status === 401
    return { outcome: 'could_not_check', why: `http ${res.status}`, escalate }
  }

  const html = await res.text()

  // ⚠ CLASSIFY BEFORE HASHING. See the header. ⚠
  const challenge = detectChallenge(html, res.headers)
  if (challenge) {
    return { outcome: 'could_not_check', why: `challenge: ${challenge}`, escalate: true }
  }

  const text = normalizePageText(html)
  if (text.split(' ').filter(Boolean).length < MIN_WORDS) {
    return { outcome: 'could_not_check', why: 'thin: needs javascript', escalate: true }
  }

  const contentHash = contentHashOf(text)
  const next: CheapCheckMemory = {
    etag: res.headers.get('etag'),
    lastModified: res.headers.get('last-modified'),
    contentHash,
  }

  if (memory.contentHash && memory.contentHash === contentHash) {
    return { outcome: 'unchanged', via: 'hash', memory: next }
  }

  return { outcome: 'changed', html, text, contentHash, finalUrl: res.url || url, memory: next }
}
