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
