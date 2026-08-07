import 'server-only'

/**
 * Fixed-window rate limiting on Upstash, over its REST API.
 *
 * No `@upstash/ratelimit` dependency: this repo's lockfile has already cost a
 * production outage once (see `.gitattributes`), and a fixed window is forty
 * lines of fetch. A sliding window would be better at the boundary; a fixed one
 * is what a 60/min guard on an internal endpoint actually needs.
 *
 * FAILS OPEN, deliberately, and only ever here. Rate limiting is abuse control,
 * not authorisation: the ingest route is already behind a constant-time token
 * compare and the public form behind Turnstile. If Upstash is unreachable, the
 * honest trade is to keep serving rather than to lock out the real caller — and
 * the thing that would actually be dangerous (an unverified captcha) fails
 * CLOSED in its own route.
 */
export interface RateLimitVerdict {
  readonly allowed: boolean
  readonly count: number
  /** True when no limiter ran at all, so `allowed` is a default rather than a measurement. */
  readonly unmeasured: boolean
}

const ALLOW_UNMEASURED: RateLimitVerdict = { allowed: true, count: 0, unmeasured: true }

export async function fixedWindowAllow(
  key: string,
  limit: number,
  windowSeconds: number,
): Promise<RateLimitVerdict> {
  const url = process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.UPSTASH_REDIS_REST_TOKEN
  if (!url || !token) return ALLOW_UNMEASURED

  const window = Math.floor(Date.now() / (windowSeconds * 1000))
  const redisKey = `sahoda:rl:${key}:${window}`

  try {
    const response = await fetch(`${url.replace(/\/$/, '')}/pipeline`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      // EXPIRE is set every call rather than only on creation: one extra command
      // is cheaper than a key that outlives its window because the INCR that
      // created it raced with a reset.
      body: JSON.stringify([
        ['INCR', redisKey],
        ['EXPIRE', redisKey, windowSeconds * 2],
      ]),
      cache: 'no-store',
    })
    if (!response.ok) return ALLOW_UNMEASURED

    const results: unknown = await response.json()
    const first = Array.isArray(results) ? results[0] : null
    const count = Number((first as { result?: unknown } | null)?.result ?? Number.NaN)
    if (!Number.isFinite(count)) return ALLOW_UNMEASURED

    return { allowed: count <= limit, count, unmeasured: false }
  } catch {
    return ALLOW_UNMEASURED
  }
}
