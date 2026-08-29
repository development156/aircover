import type { Channel } from '@sahoda/shared'

import { AUTOPILOT_REFUSALS, type AutopilotRefusal } from '@/lib/loop/autopilot-refusals'
import { AUTOPILOT_LEVEL } from './decide'

/**
 * THE AUTOPILOT DISPATCHER, PHASE TWO — which announced posts may go out now.
 *
 * ── WHY THIS IS A SECOND PASS AND NOT THE TAIL OF THE FIRST ──────────────────
 * The announcement opens a window in which one tap stops the post. A dispatcher
 * that decided and published in the same breath would have announced nothing —
 * the window would exist in the table and not in time. So the decision to
 * publish is made against rows written by an EARLIER tick, and the gap between
 * the two is the feature.
 *
 * ── THE RE-CHECK IS THE POINT, NOT A BELT AND BRACES ─────────────────────────
 * Everything true at announcement can be false thirty minutes later. Somebody
 * turns the dial down, somebody presses stop, the kill switch goes on. Phase one
 * decided that a post COULD go out; phase two decides that it still may. A
 * dispatcher that trusted its own earlier decision would publish for a customer
 * who switched autopilot off while the window was open, which is the single
 * worst thing this feature can do.
 *
 * ── AN ALREADY-DISPATCHED ROW IS NEVER DISPATCHED AGAIN ──────────────────────
 * The log is append-only and the due-scan runs every tick, so the same
 * announcement is read again and again until something terminal is recorded
 * against it. Without the `alreadyDispatched` check, a post announced once
 * publishes once per tick, for ever. That is the defect this phase is most
 * likely to have and `dispatch-due.test.ts` forces it.
 */

/** One `loop_autopilot_log` row with `decision = 'announced'`, as the scan reads it. */
export interface AnnouncedPost {
  postId: string
  variantId: string
  channel: Channel
  accountId: string
  /** When the cancel window closes. NOT NULL for an announcement, by CHECK. */
  dispatchAfter: Date
}

export interface DueWorld {
  now: Date
  /** The dial as it stands NOW, not as it stood at announcement. */
  levelFor(channel: Channel): number | undefined
  /** TRUE when a later row already recorded `cancelled` for this post and variant. */
  isCancelled(postId: string, variantId: string): boolean
  /** TRUE when a later row already recorded `dispatched` for this post and variant. */
  alreadyDispatched(postId: string, variantId: string): boolean
  /** The Loop kill switch. When it is on, nothing unattended goes out. */
  killed: boolean
}

export type DueDecision =
  | { kind: 'dispatch'; post: AnnouncedPost }
  /** Nothing to record: the window is still open, or the work is already done. */
  | { kind: 'wait'; post: AnnouncedPost; reason: AutopilotRefusal | 'already-dispatched' }
  /** A terminal refusal worth a row of its own. */
  | { kind: 'refuse'; post: AnnouncedPost; reason: AutopilotRefusal }

/**
 * Decide one announced post.
 *
 * ── WHY 'wait' AND 'refuse' ARE DIFFERENT KINDS ──────────────────────────────
 * A post inside its cancel window is not being refused; it is being waited for,
 * and writing a refusal row every tick would fill the log with the fact that
 * time had not passed yet. The same is true of one already dispatched. Only a
 * decision that ENDS the post's autopilot life earns a row.
 */
export function decideDue(post: AnnouncedPost, world: DueWorld): DueDecision {
  if (world.alreadyDispatched(post.postId, post.variantId)) {
    return { kind: 'wait', post, reason: 'already-dispatched' }
  }
  if (world.isCancelled(post.postId, post.variantId)) {
    return { kind: 'wait', post, reason: AUTOPILOT_REFUSALS.CANCELLED }
  }
  if (world.killed) return { kind: 'refuse', post, reason: AUTOPILOT_REFUSALS.CANCELLED }
  if (world.levelFor(post.channel) !== AUTOPILOT_LEVEL) {
    return { kind: 'refuse', post, reason: AUTOPILOT_REFUSALS.NOT_AUTOPILOT_CHANNEL }
  }
  if (world.now.getTime() < post.dispatchAfter.getTime()) {
    return { kind: 'wait', post, reason: AUTOPILOT_REFUSALS.INSIDE_CANCEL_WINDOW }
  }
  return { kind: 'dispatch', post }
}

/**
 * The whole due-scan. One reading of the world for every row, because a
 * dispatcher that re-read the clock per post could put two posts announced in
 * the same second on opposite sides of the window's edge.
 */
export function decideDueBatch(
  announced: readonly AnnouncedPost[],
  world: DueWorld,
): DueDecision[] {
  return announced.map((post) => decideDue(post, world))
}
