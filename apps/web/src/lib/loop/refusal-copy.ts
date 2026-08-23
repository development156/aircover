import type { Channel } from '@sahoda/shared'

import { CHANNEL_LABELS } from '@/components/posts/channel-label'

/**
 * What the Loop says when it will not plan, and why the three answers are three
 * sentences rather than one.
 *
 * ── THE DISTINCTION THIS FILE EXISTS TO KEEP ─────────────────────────────────
 * A workspace that never connected a channel needs to CONNECT one. A workspace
 * whose authorisation expired needs to RECONNECT. Sending the second one to do
 * the first is the product telling somebody something untrue about their own
 * account — and it is the likelier case, not the edge case: production on
 * 2026-08-22 held 4 `expired` connections against 2 `active` ones.
 *
 * And a read that FAILED is neither. Answering "connect a channel first" when
 * the query itself errored writes a claim about the customer into
 * `loop_cycles.failure_reason`, where /loop renders it back for weeks.
 *
 * ── WHY IT IS A SEPARATE FUNCTION ────────────────────────────────────────────
 * It lived inline in `startLoopCycle`, a server action that needs Clerk, a
 * Supabase client and the store before it can be called at all — so the only
 * available assertion was `result.ok === false`, which every one of these three
 * branches satisfies. Three different wrong sentences all pass that assertion.
 * Pulled out here, the SENTENCE is what the test can hold, which is the only
 * thing that distinguishes them.
 */

/** "Instagram", "Instagram and X", "Instagram, X and LinkedIn". */
export function formatChannels(channels: readonly Channel[]): string {
  const names = channels.map((c) => CHANNEL_LABELS[c])
  if (names.length <= 1) return names[0] ?? ''
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
}

/** The refusal for a workspace with no channel the Loop can plan for. */
export function noChannelsMessage(lapsed: readonly Channel[]): string {
  if (lapsed.length === 0) return 'Connect a channel first — Sahoda has nowhere to plan for.'
  const has = lapsed.length === 1 ? 'connection has' : 'connections have'
  const them = lapsed.length === 1 ? 'it' : 'them'
  return `Your ${formatChannels(lapsed)} ${has} lapsed — reconnect ${them} and Sahoda has somewhere to plan for again.`
}

/** The refusal for a read that did not complete. Never a claim about the account. */
export const CHANNELS_UNREADABLE_MESSAGE =
  'Sahoda couldn’t check your channels just now. Nothing was charged. Try again.'
