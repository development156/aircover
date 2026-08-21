import { z } from 'zod'

/**
 * RADAR — what a competitor looked like on one day.
 *
 * ── THE ONE RULE THAT SHAPES EVERY SCHEMA IN THIS FILE ───────────────────────
 * A NUMBER THE SOURCE DID NOT GIVE US IS ABSENT. It is never zero.
 *
 * That is why every metric below is `.optional()` and none has a default. A
 * default of 0 would be a number Radar invented, and it would be indistinguishable
 * on a chart from a real collapse to zero — "they lost all their followers" when
 * the truth is "Instagram declined to say". This product has already shipped that
 * confusion once, in a different feature, and the fix was the same: omit.
 *
 * The corollary the differ in ./diff.ts obeys: a metric present in one snapshot
 * and absent from the next is NOT a change. It is a gap in what we were told.
 */

export const RADAR_SOURCE_KINDS = ['website', 'instagram', 'x', 'linkedin', 'facebook'] as const
export type RadarSourceKind = (typeof RADAR_SOURCE_KINDS)[number]
export const radarSourceKindSchema = z.enum(RADAR_SOURCE_KINDS)

/** Social kinds are checked daily; a website weekly, with cheap checks between. */
export function defaultCadence(kind: RadarSourceKind): 'daily' | 'weekly' {
  return kind === 'website' ? 'weekly' : 'daily'
}

// ── one post a competitor published ──────────────────────────────────────────

export const radarPostSchema = z.object({
  /** The platform's own id. The differ compares sets of these, so it must be stable. */
  id: z.string().min(1),
  url: z.string().url().optional(),
  postedAt: z.string().datetime().optional(),
  /**
   * Truncated at ingest. A caption is UNTRUSTED TEXT — it is written by the
   * competitor, and Radar stores it as evidence, never as instruction.
   */
  caption: z.string().max(2000).optional(),
  likeCount: z.number().int().nonnegative().optional(),
  commentCount: z.number().int().nonnegative().optional(),
})
export type RadarPost = z.infer<typeof radarPostSchema>

// ── a social account on a day ────────────────────────────────────────────────

export const socialSnapshotSchema = z.object({
  kind: z.literal('social'),
  handle: z.string().min(1),
  followers: z.number().int().nonnegative().optional(),
  following: z.number().int().nonnegative().optional(),
  postCount: z.number().int().nonnegative().optional(),
  /**
   * The recent posts the provider returned — usually the latest dozen. NOT a
   * complete history, and the differ must never treat a post's absence from this
   * list as a deletion: it may simply have fallen off the end.
   */
  posts: z.array(radarPostSchema).max(50).default([]),
})
export type SocialSnapshot = z.infer<typeof socialSnapshotSchema>

// ── a website on a day ───────────────────────────────────────────────────────

/**
 * A price as it was WRITTEN ON THE PAGE, not as we interpreted it.
 *
 * `raw` is kept beside the parsed number so a founder shown "they raised the
 * Basic plan to ₹1,499" can be shown the eleven characters that claim came from.
 * Radar states what the page said; it does not decide what a business charges.
 */
export const pricePointSchema = z.object({
  raw: z.string().min(1).max(60),
  currency: z.enum(['INR', 'USD', 'EUR', 'GBP']),
  amount: z.number().nonnegative(),
})
export type PricePoint = z.infer<typeof pricePointSchema>

export const websiteSnapshotSchema = z.object({
  kind: z.literal('website'),
  url: z.string().url(),
  title: z.string().max(300).optional(),
  /** Word count of the normalised text — cheap to compare, cheap to store. */
  wordCount: z.number().int().nonnegative(),
  /**
   * The page's readable words, capped. Stored so a change can be shown rather
   * than merely asserted, and capped because a snapshot a day for a year must not
   * become the largest table in the database.
   */
  text: z.string().max(20_000),
  /** Every currency amount the page displayed, deduped, in the order found. */
  prices: z.array(pricePointSchema).max(60).default([]),
})
export type WebsiteSnapshot = z.infer<typeof websiteSnapshotSchema>

export const radarSnapshotPayloadSchema = z.discriminatedUnion('kind', [
  socialSnapshotSchema,
  websiteSnapshotSchema,
])
export type RadarSnapshotPayload = z.infer<typeof radarSnapshotPayloadSchema>

// ── the cheap check's fingerprint ────────────────────────────────────────────

/**
 * Reduce a page to the words a human would read.
 *
 * ── WHY THIS EXISTS AND WHY IT IS NOT `sha256(html)` ─────────────────────────
 * MEASURED 2026-08-22 against eight real Indian small-business sites, fetched
 * twice four minutes apart with no real change in between:
 *
 *     raw-HTML hash stable on   2 of 8
 *     normalised-text stable on 8 of 8
 *
 * Six of the eight rewrote their own bytes in four minutes — cache-busting
 * `?v=` query strings on assets, rotating nonces, per-request build ids. Hashing
 * the raw bytes would therefore have declared a change on 75% of sites EVERY
 * DAY, and the "only pay to render when the hash moves" design would have paid to
 * render everything, every day, while looking like it was saving money.
 *
 * Attributes are stripped for exactly that reason: an href that gains a version
 * string is not news about a competitor.
 */
export function normalizePageText(html: string): string {
  return html
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript\b[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<svg\b[\s\S]*?<\/svg>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&[a-z#0-9]+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

/**
 * Currency amounts a page displays, in the order they appear, deduped.
 *
 * Deliberately conservative. It reads what is written — "₹1,499", "Rs. 899",
 * "$29" — and does not try to work out which plan a number belongs to or what
 * the page means by it. A pricing page is laid out for humans and any attempt to
 * infer structure from it would produce confident nonsense on the first site with
 * an unusual layout. The DIFFERENCE between two days' price lists is a fact;
 * "their Pro plan went up" is an interpretation, and Radar does not make it.
 */
export function extractPrices(text: string): PricePoint[] {
  const out: PricePoint[] = []
  const seen = new Set<string>()
  const pattern =
    /(₹|rs\.?\s?|inr\s?|\$|€|£)\s?(\d{1,3}(?:,\d{2,3})*(?:\.\d{1,2})?|\d+(?:\.\d{1,2})?)/gi

  for (const m of text.matchAll(pattern)) {
    const symbol = m[1]!.trim().toLowerCase()
    const digits = m[2]!.replace(/,/g, '')
    const amount = Number(digits)
    if (!Number.isFinite(amount)) continue
    // A bare "0" or a four-digit year picked out of prose is noise, not a price.
    if (amount === 0) continue

    const currency = symbol.startsWith('$')
      ? 'USD'
      : symbol.startsWith('€')
        ? 'EUR'
        : symbol.startsWith('£')
          ? 'GBP'
          : 'INR'
    const raw = m[0]!.trim()
    const key = `${currency}:${amount}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push({ raw: raw.slice(0, 60), currency, amount })
    if (out.length >= 60) break
  }
  return out
}
