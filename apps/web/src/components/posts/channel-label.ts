import type { Channel } from '@sahoda/shared'

/**
 * Display names for the four `ChannelSchema` values. Presentation only — the
 * channel union itself always comes from @sahoda/shared, never from here.
 */
export const CHANNEL_LABELS: Readonly<Record<Channel, string>> = {
  x: 'X',
  gbp: 'Google Business Profile',
  linkedin: 'LinkedIn',
  instagram: 'Instagram',
}

/** Short form for pill tabs, where the full GBP name will not fit. */
export const CHANNEL_SHORT: Readonly<Record<Channel, string>> = {
  x: 'X',
  gbp: 'GBP',
  linkedin: 'LinkedIn',
  instagram: 'Instagram',
}
