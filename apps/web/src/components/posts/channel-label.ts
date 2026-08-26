import type { Channel } from '@sahoda/shared'

/**
 * Display names for every `ChannelSchema` value. Presentation only — the channel
 * union itself always comes from @sahoda/shared, never from here.
 *
 * Typed as an exhaustive `Record<Channel, …>` on purpose: a channel added to the
 * schema is a COMPILE ERROR here rather than a screen rendering a raw `telegram`
 * where a name should be. That is what happened when facebook and telegram were
 * added — this file was one of six the compiler handed over as a to-do list.
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
