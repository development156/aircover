import { ChannelSchema, type Channel } from '@sahoda/shared'

/**
 * THE CHANNELS THE LOOP CAN PLAN FOR — read off the shared vocabulary, never typed.
 *
 * ── WHY THIS FILE EXISTS ─────────────────────────────────────────────────────
 * `eligibility.ts` and `read.ts` each carried their own literal
 * `['x', 'gbp', 'linkedin', 'instagram']` while `actions/loop-cycle.ts` filtered
 * through `ChannelSchema.options` after a comment naming exactly that drift as
 * the defect being removed. The three disagreed the day Facebook and Telegram
 * joined the enum: the Sunday cron and the /loop screen refused a workspace
 * whose only live channel was Facebook, while the manual run planned for it at
 * a level the dial could not show. One list, derived, cannot drift.
 *
 * `loop_channel_autonomy`'s CHECK already admits every value of the enum, so
 * the database side was ready before this file was.
 */
export const PLANNABLE_CHANNELS: readonly Channel[] = ChannelSchema.options

/** Narrow a `connections.platform` string to a channel the Loop plans for. */
export function isPlannableChannel(platform: string): platform is Channel {
  return (PLANNABLE_CHANNELS as readonly string[]).includes(platform)
}
