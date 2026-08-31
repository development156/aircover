import type { Channel } from '@sahoda/shared'

import { ChannelLogo } from '@/components/connections/channel-logo'

/**
 * A platform's own logo, on the composer and the planner.
 *
 * ── THE ONE PLACE BRAND COLOUR IS ALLOWED IN ───────────────────────────────────
 * docs/26 §1.6: platform marks keep their own brand colours, because that is
 * IDENTITY rather than UI chrome. It is the only exception in the system, and it
 * never leaks into a button, a surface or body text — which is why this is a
 * component and not a class anybody can reach for.
 *
 * ── IT USED TO KEEP ITS OWN MAP, AND THE MAP HAD THREE ENTRIES ───────────────
 * Reported from the screen, 2026-08-29: the composer's channel row showed a grey
 * MAP PIN beside Google Business Profile, Facebook Pages and Telegram, while
 * `/connections` showed all three correctly. Two components answered the same
 * question — "what does this platform look like?" — from two different tables,
 * and only one of them was ever completed.
 *
 * `channel-logo.tsx` is the one that was completed, and its own header records
 * why: the package already ships facebook, telegram, tiktok, whatsapp and
 * youtube marks that nothing was using, and GBP and Pinterest ship none and are
 * drawn to scale in `drawn-marks.tsx`. All six `Channel` values are covered
 * there. So this file stops being a second table and becomes a THIN ADAPTER:
 * `Channel` (six things Sahoda can publish to) is a subset of `CatalogueChannel`
 * (fourteen things it can hold a binding for), so the delegation needs no
 * mapping at all.
 *
 * The map-pin is gone with it, and that mattered on its own: a pin is a PLACE,
 * so as a stand-in for a missing logo it read as a claim about the CHANNEL
 * rather than an admission about us — and the channel it most often stood in
 * for was a listings product, which made the wrong reading the plausible one.
 */

export interface ChannelMarkProps {
  channel: Channel
  size?: number
}

export function ChannelMark({ channel, size = 18 }: ChannelMarkProps) {
  return <ChannelLogo channel={channel} size={size} />
}
