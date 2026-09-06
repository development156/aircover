import { ChannelSchema, type Channel } from '@sahoda/shared'

/**
 * The ONE place that knows Zernio's platform names are not ours.
 *
 * ── WHY THIS FILE EXISTS ─────────────────────────────────────────────────────
 * The same two-entry map was written out three times: `lib/inbox/conversations.ts`
 * (`PLATFORM`), `lib/inbox/store-read.ts` (`STORED_PLATFORM`) and
 * `lib/zernio/webhook-store.ts` (`ZERNIO_SPELLINGS`). Two of them translate our
 * channel into Zernio's word, one translates Zernio's word into our channel, and
 * all three had to agree for a stored Instagram DM to render on the Instagram row
 * it came from. Three copies of a two-line fact is three chances for the next
 * platform to be added to two of them.
 *
 * Deliberately NOT server-only: the row builders in `components/inbox` are client
 * components and read the same vocabulary.
 */

/**
 * The two names Zernio uses that are not ours. `twitter` is Zernio's spelling and
 * `x` is ours; `googlebusiness` is theirs and `gbp` is ours. Zernio uses BOTH
 * spellings depending on the endpoint — its own publish, validate, edit and
 * unpublish surfaces disagree about the name of the same platform, and this map is
 * the one place that has to survive all four.
 */
export const ZERNIO_SPELLINGS: Readonly<Record<string, Channel>> = Object.freeze({
  twitter: 'x',
  googlebusiness: 'gbp',
})

/**
 * Zernio's platform names → this product's channels.
 *
 * NOT a lookup with a fallback. A fallback is how a Reddit comment becomes an
 * Instagram row. An unmapped platform returns undefined and the caller reports
 * `channel_not_representable`, which is a fact rather than a guess.
 *
 * ── DERIVED FROM `ChannelSchema`, NEVER LISTED HERE ──────────────────────────
 * This was a six-key literal typed `'x' | 'gbp' | 'linkedin' | 'instagram'`. When
 * `facebook` and `telegram` joined the schema on 2026-08-26, and
 * `inbox_threads.channel` was widened to admit them in the same migration, the
 * literal kept typechecking and every Facebook DM and comment the receiver stored
 * came back `channel_not_representable`: in the event log, never in the inbox.
 * Every channel the schema admits maps to itself; only the spellings above are
 * written by hand, and `whatsapp`, `sms`, `reddit` and the rest stay absent because
 * they are absent from the schema.
 */
export const CHANNEL: Readonly<Record<string, Channel>> = Object.freeze({
  ...Object.fromEntries(ChannelSchema.options.map((channel) => [channel, channel])),
  ...ZERNIO_SPELLINGS,
})

/**
 * Our channel → the platform word Zernio (and therefore every inbox row) uses.
 *
 * The inverse of `ZERNIO_SPELLINGS`, INVERTED rather than written out again, so a
 * third spelling added above cannot arrive here half-applied. Every channel that is
 * already Zernio's own name falls through unchanged — a fallback is right in this
 * direction, because the value is a display key, not a routing decision.
 */
const OUR_CHANNEL_TO_ZERNIO: Readonly<Record<string, string>> = Object.freeze(
  Object.fromEntries(Object.entries(ZERNIO_SPELLINGS).map(([zernio, ours]) => [ours, zernio])),
)

export function zernioPlatform(channel: string): string {
  return OUR_CHANNEL_TO_ZERNIO[channel] ?? channel
}
