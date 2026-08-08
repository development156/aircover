import type { InboxPlatform } from '@sahoda/shared'

/**
 * Display names for the platforms an `/inbox/*` row can carry. Presentation only —
 * the union itself always comes from @sahoda/shared.
 *
 * `Record<InboxPlatform, string>` on purpose: adding a value to `InboxPlatformSchema`
 * becomes a compile error here rather than rendering a raw API string at a customer.
 */
export const PLATFORM_LABELS: Readonly<Record<InboxPlatform, string>> = {
  facebook: 'Facebook',
  instagram: 'Instagram',
  whatsapp: 'WhatsApp',
  twitter: 'X',
  bluesky: 'Bluesky',
  reddit: 'Reddit',
  telegram: 'Telegram',
  googlebusiness: 'Google Business Profile',
}

/**
 * Label an arbitrary platform string.
 *
 * Zernio can name a platform we have not modelled yet, so this takes `string`. An
 * unknown value renders verbatim rather than as "Unknown" — the real name is more
 * useful to a user reporting a problem than our failure to recognise it.
 */
export function platformLabel(platform: string | undefined): string {
  if (!platform) return 'Unknown platform'
  return PLATFORM_LABELS[platform as InboxPlatform] ?? platform
}
