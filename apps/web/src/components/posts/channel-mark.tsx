import type { Channel } from '@sahoda/shared'

import { ChannelLogo } from '@/components/connections/channel-logo'

/**
 * A platform's own logo, for the composer, the planner and the posts list.
 *
 * ── THIS FILE HELD A SECOND, STALER COPY OF THE SAME MAP ─────────────────────
 * It carried its own `MARK` record with three PNGs — instagram, linkedin, x —
 * and fell through to a grey MAP PIN for everything else. `ChannelLogo` on
 * /connections has the complete set: six shipped PNGs plus seven marks drawn to
 * scale for the platforms that ship none.
 *
 * So Google Business Profile, Facebook Pages and Telegram all rendered as the
 * SAME anonymous pin in the channel picker, on a row whose entire job is telling
 * channels apart — while three feet away on /connections they had their own
 * logos. Two maps for one question is why one of them went stale, and adding
 * three more entries here would have left the same trap for the next platform.
 *
 * There is one map now and this is a thin wrapper over it. `CatalogueChannel` is
 * a superset of `Channel`, so every value this component can receive is one
 * `ChannelLogo` already handles.
 *
 * ── THE MAP PIN WAS WORSE THAN ANONYMOUS ─────────────────────────────────────
 * A pin is a PLACE. As a stand-in for a missing logo it read as a claim about
 * the channel rather than an admission about us, and it was plausible on exactly
 * one of the three — a listings product — which is what let it look deliberate.
 * `ChannelLogo`'s fallback is `CircleSlash`, which says "no mark" and is true.
 *
 * Brand colour is allowed here and nowhere else: a logo is IDENTITY, not UI
 * chrome (docs/26 §1.6). Decorative always — every call site renders the channel
 * name beside it, so alt text would make a screen reader say "Instagram
 * Instagram".
 */

export interface ChannelMarkProps {
  channel: Channel
  size?: number
}

export function ChannelMark({ channel, size = 18 }: ChannelMarkProps) {
  return <ChannelLogo channel={channel} size={size} className="rounded-sm" />
}
