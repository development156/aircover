/**
 * WEB — the rendered fetch, for the pages our own request cannot read.
 *
 * ── WHY TINYFISH AND NOT ZYTE (2026-09-06, founder's ruling) ─────────────────
 * Zyte was the paid last rung of the website ladder and the reasons it was
 * chosen (its key existed; Radar wants HTML, not markdown; it bills only for
 * success) all still hold, and are all beaten by one fact: TinyFish Fetch is
 * FREE per call (150 URLs a minute, 1,000 a day per key), renders JavaScript,
 * and reads through residential IPs, so a bot wall that refuses our Mumbai
 * origin serves it the page a person gets. Fifty workspaces watching twelve
 * rivals is 600 pages a day at most, under the cap, and the cap is a rate,
 * not a bill.
 *
 * ── WHAT THE ESTIMATE IS, AND WHY IT IS ZERO ─────────────────────────────────
 * `withSpend` reserves an estimate before every render. Zyte's was 1,010
 * micro-dollars and could never be confirmed, because Zyte reports cost
 * nowhere. TinyFish's is 0 and that is the honest figure: the fetch spends one
 * of the day's 1,000, which is a rate limit and not money. A `costBasis` of
 * 'free' says so on the row, the same word the conditional GET uses.
 *
 * Same shape as the Zyte function it replaces (`html`, `finalUrl`,
 * `statusCode`), so `run.ts` hashes and diffs exactly as before. The vendor's
 * error prose is never echoed: the status is enough to classify by, and a
 * vendor's sentence has no business on a founder's screen.
 */
export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>

export const TINYFISH_RENDER_ESTIMATE_MICROS = 0
export const TINYFISH_FETCH_URL = 'https://api.fetch.tinyfish.ai'

export interface TinyFishOptions {
  apiKey: string
  fetch?: FetchLike
  timeoutMs?: number
  baseUrl?: string
}

export interface TinyFishResult {
  html: string
  finalUrl: string
  statusCode: number
}

export async function tinyfishFetch(
  url: string,
  options: TinyFishOptions,
): Promise<TinyFishResult> {
  const doFetch = options.fetch ?? fetch
  const res = await doFetch(options.baseUrl ?? TINYFISH_FETCH_URL, {
    method: 'POST',
    headers: { 'x-api-key': options.apiKey, 'content-type': 'application/json' },
    // `ttl: 0` is a LIVE fetch. A cached copy from an earlier caller would
    // hash the same as last night and read as "unchanged" when it is not.
    body: JSON.stringify({ urls: [url], format: 'html', ttl: 0 }),
    signal: AbortSignal.timeout(options.timeoutMs ?? 60_000),
  })
  if (!res.ok) {
    throw new Error(`tinyfish: http ${res.status}`)
  }
  const body = (await res.json()) as {
    results?: Array<{ url?: string; final_url?: string; text?: unknown }>
    errors?: Array<{ url?: string; error?: string }>
  }
  const first = body.results?.[0]
  if (!first || typeof first.text !== 'string' || first.text.length === 0) {
    // A 200 with the page under `errors[]` is the vendor saying it could not
    // read it either. That is a gap to record, not a page to hash.
    throw new Error('tinyfish: no html returned')
  }
  return {
    html: first.text,
    finalUrl: first.final_url ?? first.url ?? url,
    statusCode: 200,
  }
}
