import { ChannelSchema, type Channel } from '@sahoda/shared'

import { isOfferedForConnect } from '@/lib/connections/offer'

/**
 * The channels a customer is OFFERED as somewhere a post could go, in schema order.
 *
 * ── ONE SOURCE, BECAUSE TWO SCREENS DISAGREED ────────────────────────────────
 * MEASURED 2026-09-05 (docs/51, Q-12): `/posts` and `/planner` named six channels
 * under "Connect a channel" — X, Google Business Profile, LinkedIn, Instagram,
 * Facebook Pages, Telegram — while the composer's channel row on the same
 * screens offered five. The note mapped over the whole `ChannelSchema`; the
 * picker had already been taught `HIDDEN_FROM_OFFER` (see `offer.ts`). Both
 * answer "where can this go?", and only one of them had been told the answer.
 *
 * So both read this function. It is the picker's rule lifted out of the picker:
 * every `Channel` the product offers for connecting, plus whatever the caller
 * must NOT take away.
 *
 * `keep` is the composer's half of the rule. A post that already carries a
 * withheld channel keeps its chip and can still be unticked; dropping it would
 * silently rewrite somebody's saved choice the moment they opened the post.
 * The note passes nothing: it names what connecting would buy, and a channel
 * nobody is offered is not on that list.
 *
 * Reads `ChannelSchema.options`, never a literal list, for the reason
 * `channel-label.ts` records: a hand-typed list silently omits the channel the
 * product added last.
 */
export function offeredChannels(keep: readonly Channel[] = []): Channel[] {
  return ChannelSchema.options.filter(
    (channel) => isOfferedForConnect(channel) || keep.includes(channel),
  )
}
