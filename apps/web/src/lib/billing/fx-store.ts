import 'server-only'

import { FxRatesSchema, DISPLAY_CURRENCIES, type FxRates } from '@sahoda/shared'

/**
 * One day's exchange rates, cached in Upstash, for approximating a rupee price.
 *
 * ## Why this exists rather than a constant
 *
 * There was already one hardcoded rate in this codebase — 88 rupees to the
 * dollar in `door-step.tsx` — and `finance/pricing-model.json` records it as
 * "the only FX assumption in the codebase, stale by 8.5%". A constant does not
 * announce that it has drifted; it keeps rendering a confident wrong number. A
 * second hardcoded table would be the same defect twice.
 *
 * ## Every failure path returns null, and null is not an error
 *
 * No credentials, a dead feed, a malformed body, a currency the feed dropped:
 * all of them yield null, and null renders as the rupee price with nothing
 * appended. That is a TRUE statement — the plan does cost ₹1,999 — so the
 * degraded state is honest rather than empty.
 *
 * This is the opposite of what a thrown error would do. The rupee price is the
 * charge; the approximation is a courtesy. A courtesy must never be able to take
 * down the screen that sells the plan.
 *
 * ## Frankfurter, and what it costs us
 *
 * `api.frankfurter.dev` publishes ECB reference rates, needs no key and no
 * account, and is the reason this needed no new secret and no new vendor
 * relationship. What we accept in exchange:
 *
 *   · ECB publishes ONCE PER WORKING DAY, around 16:00 CET. These rates are
 *     never live to the minute, which is fine for a figure already labelled
 *     approximate and would NOT be fine for anything that settles money.
 *   · No rate moves at a weekend. Friday's rate is what Sunday returns.
 *   · The feed does not carry every currency. A missing one yields no
 *     approximation for that currency and leaves the others untouched.
 *
 * ## The cache is deliberately allowed to outlive its TTL logically
 *
 * `fetchedAt` travels WITH the rates, so a caller can say "as of 24 August"
 * rather than implying now. A day-old rate labelled with its date is honest; a
 * day-old rate presented as current is the drift this module exists to stop.
 */

const KEY = 'sahoda:fx:inr-base:v1'

/**
 * A working day plus slack. Long enough to ride out a weekend and a public
 * holiday, so the feed being closed on a Sunday costs a re-fetch rather than a
 * blank approximation on every pricing screen.
 */
const TTL_SECONDS = 4 * 24 * 60 * 60

/** Rates older than this are refreshed on read, even though the key is still alive. */
const STALE_AFTER_MS = 20 * 60 * 60 * 1000

function credentials(): { url: string; token: string } | null {
  const url = process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.UPSTASH_REDIS_REST_TOKEN
  if (!url || !token) return null
  return { url: url.replace(/\/$/, ''), token }
}

async function readCache(): Promise<FxRates | null> {
  const creds = credentials()
  if (creds === null) return null

  try {
    const response = await fetch(`${creds.url}/get/${encodeURIComponent(KEY)}`, {
      headers: { Authorization: `Bearer ${creds.token}` },
      cache: 'no-store',
    })
    if (!response.ok) return null
    const body = (await response.json()) as { result?: unknown }
    // Upstash answers `{"result": null}` for a missing key and a STRING for a
    // present one. Anything else is treated as absent rather than coerced.
    if (typeof body.result !== 'string') return null

    // Parsed, not cast. A cached shape from an older deploy must fail closed to
    // "no approximation" rather than reach the formatter as a wrong number.
    const parsed = FxRatesSchema.safeParse(JSON.parse(body.result))
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}

async function writeCache(rates: FxRates): Promise<void> {
  const creds = credentials()
  if (creds === null) return

  try {
    await fetch(`${creds.url}/set/${encodeURIComponent(KEY)}?EX=${TTL_SECONDS}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${creds.token}`, 'Content-Type': 'text/plain' },
      body: JSON.stringify(rates),
      cache: 'no-store',
    })
  } catch {
    // Swallowed on purpose. A cache write that fails costs one extra fetch on
    // the next request; a throw here would cost the pricing screen.
  }
}

async function fetchRates(nowIso: string): Promise<FxRates | null> {
  try {
    const wanted = DISPLAY_CURRENCIES.join(',')
    const response = await fetch(
      `https://api.frankfurter.dev/v1/latest?base=INR&symbols=${wanted}`,
      { cache: 'no-store', signal: AbortSignal.timeout(4000) },
    )
    if (!response.ok) return null

    const body = (await response.json()) as { rates?: unknown }
    if (typeof body.rates !== 'object' || body.rates === null) return null

    // Only the currencies this product actually renders are kept, and each is
    // checked to be a positive finite number. A feed that starts returning null
    // or a string for one currency must not turn into a zero price.
    const source = body.rates as Record<string, unknown>
    const rates: Partial<Record<(typeof DISPLAY_CURRENCIES)[number], number>> = {}
    for (const currency of DISPLAY_CURRENCIES) {
      const value = source[currency]
      if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
        rates[currency] = value
      }
    }
    if (Object.keys(rates).length === 0) return null

    const parsed = FxRatesSchema.safeParse({ base: 'INR', fetchedAt: nowIso, rates })
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}

/**
 * Today's rates, or null when no honest approximation can be made.
 *
 * Serves a cached set when it is fresh. When it is stale it refetches, and if
 * that refetch fails it returns the STALE SET rather than nothing — a rate from
 * yesterday, carrying yesterday's date, is a better answer than silence, and the
 * caller renders the date.
 */
export async function getFxRates(now: Date = new Date()): Promise<FxRates | null> {
  const cached = await readCache()
  if (cached !== null) {
    const age = now.getTime() - new Date(cached.fetchedAt).getTime()
    if (Number.isFinite(age) && age >= 0 && age < STALE_AFTER_MS) return cached
  }

  const fresh = await fetchRates(now.toISOString())
  if (fresh === null) return cached
  await writeCache(fresh)
  return fresh
}
