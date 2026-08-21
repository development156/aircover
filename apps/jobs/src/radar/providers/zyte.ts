/**
 * WEB — the paid fetch, for the pages our own request cannot read.
 *
 * ── WHY ZYTE AND NOT FIRECRAWL ───────────────────────────────────────────────
 * Both were considered. The deciding facts, in order:
 *
 *   1. ZYTE'S KEY IS THE ONE THAT EXISTS. `ZYTE_API_KEY` is in the environment and
 *      authenticates — measured 2026-08-22, a real extract came back 200 with a
 *      body. `FIRECRAWL_API_KEY` is absent from every env file in this repository,
 *      which is also why `@sahoda/research`'s tier 3 has been behind a flag,
 *      default off, since it was written.
 *   2. RADAR DOES NOT NEED MARKDOWN. Firecrawl's advantage is clean Markdown for a
 *      model to read. Radar hashes normalised words and diffs numbers; it needs
 *      HTML and nothing else. Paying for a conversion we throw away is not a
 *      trade worth making.
 *   3. ZYTE BILLS ONLY FOR SUCCESSFUL RESPONSES — its own documented behaviour —
 *      which matters for a job that exists to check pages that may be refusing us.
 *
 * ── AND THE HONEST COST PROBLEM, MEASURED ────────────────────────────────────
 * Zyte reports what a request cost NOWHERE. The response body carries only
 * `url`, `statusCode` and `httpResponseBody`; there is no cost header; and
 * `/v1/stats`, `/v1/usage` and the app usage path all answer 404. Zyte also
 * assigns a price TIER per target website automatically, so the real figure is a
 * property of that competitor's site and cannot be read off any price list.
 *
 * Therefore every Zyte row in `radar_fetch_log` carries `cost_basis = 'estimated'`
 * and the tier's list price, and any total shown to the founder must state the
 * split rather than adding estimates to measurements and calling the sum "what
 * Radar cost".
 *
 * ── WHEN THIS IS CALLED, WHICH IS RARELY ─────────────────────────────────────
 * Only when the free check could not see the page: a bot wall, a 403/429, or a
 * shell that needs JavaScript. When the free check SUCCEEDS and finds a change,
 * the HTML is already in hand and there is nothing left to pay for. MEASURED on
 * eight real Indian SMB sites: 8 of 8 answered our own request directly and none
 * served a challenge, so on that sample this file would not have been reached at
 * all.
 */

export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>

/**
 * The list price used as the reservation estimate and then kept as the settled
 * figure, because nothing better is obtainable. Zyte's published pay-as-you-go
 * range for browser-rendered requests starts around $1.01 per 1,000; this is the
 * lower end, and it is a FLOOR rather than a forecast — a protected target sits
 * several tiers above it. Raise it here, in one place, when the dashboard says so.
 */
export const ZYTE_RENDER_ESTIMATE_MICROS = 1010

export interface ZyteOptions {
  apiKey: string
  fetch?: FetchLike
  timeoutMs?: number
}

export interface ZyteResult {
  html: string
  finalUrl: string
  statusCode: number
}

/**
 * Fetch one page through Zyte, rendered.
 *
 * `browserHtml` rather than `httpResponseBody`: this is only reached when our own
 * plain request already failed, and the two commonest reasons — a bot wall and a
 * page that needs JavaScript — are both things only a browser fixes. Asking for
 * the cheap tier here would pay for a second copy of the failure we already have.
 */
export async function zyteFetch(url: string, options: ZyteOptions): Promise<ZyteResult> {
  const doFetch = options.fetch ?? fetch
  const auth = Buffer.from(`${options.apiKey}:`).toString('base64')

  const res = await doFetch('https://api.zyte.com/v1/extract', {
    method: 'POST',
    headers: { authorization: `Basic ${auth}`, 'content-type': 'application/json' },
    body: JSON.stringify({ url, browserHtml: true }),
    signal: AbortSignal.timeout(options.timeoutMs ?? 60_000),
  })

  if (!res.ok) {
    // Zyte's own errors are JSON with a `type` and a `title`. Neither is echoed
    // into a customer-facing string; the status is enough to classify by, and a
    // vendor's prose has no business on a founder's screen.
    throw new Error(`zyte: http ${res.status}`)
  }

  const body = (await res.json()) as {
    url?: string
    statusCode?: number
    browserHtml?: string
  }
  if (typeof body.browserHtml !== 'string' || body.browserHtml.length === 0) {
    throw new Error('zyte: no html returned')
  }

  return {
    html: body.browserHtml,
    finalUrl: body.url ?? url,
    statusCode: body.statusCode ?? 200,
  }
}
