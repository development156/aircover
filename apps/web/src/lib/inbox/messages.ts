import { messageDirection, type ZernioMessage } from '@sahoda/publishing'
import { InboxPlatformSchema, type InboxPlatform } from '@sahoda/shared'

/**
 * Reading the two facts a reply affordance needs out of a page of messages.
 *
 * Pure and separate from `./read` so both are testable without a Zernio key: what we
 * are entitled to claim about a thread is decided here, and only the fetching is
 * server-only.
 */

/**
 * ── RESOLVED `[LIVE 2026-08-10]`: THE VALUE OF `direction` ───────────────────
 * This module used to compare `m.direction === 'inbound'`, which was doc 13's word and
 * had never been measured. The first real thread carries **`'incoming'`** — so this
 * returned null for every thread, and every reply affordance in the product rendered
 * `unknown` permanently. The degradation was honest, and it looked exactly like a
 * working feature.
 *
 * The vocabulary now lives in `messageDirection` (`@sahoda/publishing`, which owns the
 * wire shape), because it had a second caller: `components/inbox/message-list.tsx` was
 * comparing the same literal to decide which side of the thread a bubble renders on.
 * One spelling, two independent bugs — fixing this file alone would have left the
 * customer's own words attributed to the shop owner.
 */

/**
 * The newest inbound message in a page, which is what a send window is measured from.
 *
 * Returns `null` when the page holds no inbound message — a genuine "we do not know",
 * which `evaluateSendWindow` turns into the `unknown` affordance rather than guessing.
 * A message whose direction we cannot classify is `unknown` and is skipped here too: it
 * must not open a window it did not earn. Order is not assumed; the messages are
 * scanned (Zernio reports `sortOrderApplied: 'asc'`, but that is a convenience).
 */
export function newestInboundAt(messages: readonly ZernioMessage[]): string | null {
  let newest: string | null = null
  let newestMs = Number.NEGATIVE_INFINITY
  for (const m of messages) {
    if (messageDirection(m) !== 'inbound' || !m.createdAt) continue
    const ms = Date.parse(m.createdAt)
    if (Number.isNaN(ms) || ms <= newestMs) continue
    newestMs = ms
    newest = m.createdAt
  }
  return newest
}

/**
 * A page of messages in chronological order, oldest first — how a chat reads.
 *
 * ── WHY SORT LOCALLY RATHER THAN TRUST THE REQUEST ───────────────────────────
 * The thread is FETCHED newest-first (`sortOrder: 'desc'`), because Zernio's default of
 * oldest-first returns the wrong page entirely on a long thread — the newest inbound
 * message, which the reply window is measured from, would not be in it. Having asked
 * for the newest 50, the display order still has to be flipped back.
 *
 * Sorting by `createdAt` rather than reversing the array is deliberate: Facebook and
 * Bluesky return newest-first whatever is requested and only reverse WITHIN a page, so
 * a blind reverse would mis-order exactly the platforms whose order we cannot dictate.
 * `sortOrderApplied` reports what happened, but sorting by the timestamps we can see is
 * true whatever it says. Messages with no readable timestamp keep their relative
 * position rather than being dropped or floated to one end.
 */
export function inChronologicalOrder(messages: readonly ZernioMessage[]): ZernioMessage[] {
  return [...messages]
    .map((message, index) => ({ message, index, ms: Date.parse(message.createdAt ?? '') }))
    .sort((a, b) => {
      if (Number.isNaN(a.ms) || Number.isNaN(b.ms)) return a.index - b.index
      return a.ms === b.ms ? a.index - b.index : a.ms - b.ms
    })
    .map((entry) => entry.message)
}

/**
 * The thread's platform, or `null` when no message states one we model.
 *
 * Null rather than a default: a send window is a per-platform rule, and picking a
 * platform to produce one would invent the very answer the affordance exists to state
 * honestly. An unrecognised platform string yields null and the UI says it does not
 * know — it never silently gets Instagram's rules.
 */
export function threadPlatform(messages: readonly ZernioMessage[]): InboxPlatform | null {
  for (const m of messages) {
    const parsed = InboxPlatformSchema.safeParse(m.platform)
    if (parsed.success) return parsed.data
  }
  return null
}
