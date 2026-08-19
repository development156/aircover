import type { Channel } from '@sahoda/shared'
import { isPostFormat, type PostFormat } from '@sahoda/publishing'

/**
 * What kind of post each channel's version was written as.
 *
 * ── THE SAME RENDER-EDGE PROBLEM AS `version`, AND THE SAME ANSWER ───────────
 * `post_variants.format` exists (migration 20260819000200), and
 * `PostVariantSchema` is a frozen plain object schema — so it STRIPS the column
 * before any screen sees it. The value is therefore read out of the same raw rows
 * the parse discards it from, exactly as `variant-version.ts` does for the edit
 * counter. There is no second query.
 *
 * ── NULL IS A REAL ANSWER, NOT A MISSING ONE ─────────────────────────────────
 * Most variants have no format and never will: the column was added on
 * 2026-08-19 and everything before it states no intent. Null must therefore mean
 * "nobody said", never be defaulted to a value — a default would invent an intent
 * the writer did not express, and publishing now REFUSES a post that contradicts
 * its format. Defaulting to `image` would break every existing text post on x,
 * gbp and linkedin the moment it was written back.
 */
export type VariantFormats = Partial<Record<Channel, PostFormat>>

export function formatsFromRows(rows: readonly unknown[]): VariantFormats {
  const byChannel: VariantFormats = {}
  for (const raw of rows) {
    if (typeof raw !== 'object' || raw === null) continue
    const row = raw as Record<string, unknown>
    const channel = row.channel
    if (typeof channel !== 'string') continue
    // Anything the app does not recognise is read as no format at all. A value it
    // cannot reason about is not an intent it can hold a post to.
    if (!isPostFormat(row.format)) continue
    byChannel[channel as Channel] = row.format
  }
  return byChannel
}
