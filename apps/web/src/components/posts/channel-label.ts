import type { Channel, ConnectionPlatform } from '@sahoda/shared'

/**
 * Display names for every `ChannelSchema` value. Presentation only — the channel
 * union itself always comes from @sahoda/shared, never from here.
 *
 * Typed as an exhaustive `Record<Channel, …>` on purpose: a channel added to the
 * schema is a COMPILE ERROR rather than a screen rendering a raw `telegram`
 * where a name should be. That is what happened when facebook and telegram were
 * added — this file was one of six the compiler handed over as a to-do list.
 *
 * ── THERE IS A SECOND COPY, IN `packages/shared`, AND THAT IS DELIBERATE ─────
 * The publishing adapters build sentences a customer reads and were
 * interpolating the raw enum key ("gbp allows 1 media items"), so the same names
 * had to exist inside `packages/shared`, which cannot import from `apps/web`.
 * Re-exporting the shared map from here is the tidy answer and it costs real
 * bytes: MEASURED with `next build` either side of that one-line change,
 * `/(app)/posts` grew **+10.9 kB, over budget**, because the shared barrel
 * reaches the whole constraint table from one import (see the note in
 * `packages/shared/package.json`, which records search-tokens.ts doing this to
 * eleven routes). A presentation string is not worth that on a phone.
 *
 * `channel-label.test.ts` is the guard across the seam: the two maps must agree,
 * name for name, or it goes red.
 */
export const CHANNEL_LABELS: Readonly<Record<Channel, string>> = {
  x: 'X',
  gbp: 'Google Business Profile',
  linkedin: 'LinkedIn',
  instagram: 'Instagram',
  facebook: 'Facebook Pages',
  telegram: 'Telegram',
}

/** Short form for pill tabs, where the full GBP name will not fit. */
export const CHANNEL_SHORT: Readonly<Record<Channel, string>> = {
  x: 'X',
  gbp: 'GBP',
  linkedin: 'LinkedIn',
  instagram: 'Instagram',
  // "Facebook", not "Facebook Pages". The long name exists to say WHICH Facebook
  // surface Sahoda posts to, and a pill tab has no room for the distinction.
  facebook: 'Facebook',
  telegram: 'Telegram',
}

/**
 * Display names for every `ConnectionPlatformSchema` value — the name of a thing
 * a customer can LINK.
 *
 * ── WHY THIS IS NOT `CHANNEL_LABELS` WITH MORE ROWS ──────────────────────────
 * `Channel` is what Sahoda can PUBLISH to (six values) and `ConnectionPlatform`
 * is what it can hold a binding for (fourteen). Three screens were indexing
 * `CHANNEL_LABELS` with `connection.platform`, which typechecked only while the
 * two sets happened to be equal. The day eight connect-only platforms landed, the
 * compiler handed those three over as a to-do list — which is the whole reason
 * both maps are exhaustive `Record`s rather than partials with a fallback.
 *
 * Use CHANNEL_LABELS when the subject is a post going out. Use this when the
 * subject is an account being linked.
 */
export const PLATFORM_LABELS: Readonly<Record<ConnectionPlatform, string>> = {
  ...CHANNEL_LABELS,
  discord: 'Discord',
  pinterest: 'Pinterest',
  reddit: 'Reddit',
  slack: 'Slack',
  threads: 'Threads',
  tiktok: 'TikTok',
  whatsapp: 'WhatsApp',
  youtube: 'YouTube',
}
