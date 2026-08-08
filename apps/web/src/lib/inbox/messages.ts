import type { ZernioMessage } from '@sahoda/publishing'
import { InboxPlatformSchema, type InboxPlatform } from '@sahoda/shared'

/**
 * Reading the two facts a reply affordance needs out of a page of messages.
 *
 * Pure and separate from `./read` so both are testable without a Zernio key: what we
 * are entitled to claim about a thread is decided here, and only the fetching is
 * server-only.
 */

/**
 * ── UNVERIFIED: THE VALUE OF `direction` ─────────────────────────────────────
 * `ZernioMessage.direction` is typed as a bare `string` because nothing in doc 13
 * records a live message payload — the `/inbox/conversations/{id}/messages` response
 * has never been observed with real data. `'inbound'` is the documented value, not a
 * measured one.
 *
 * If Zernio actually sends `'in'` or `'received'`, `newestInboundAt` returns null for
 * every thread and every reply affordance renders `unknown`. That degradation is the
 * honest one — `unknown` claims nothing — but it is a degradation, and this is where
 * to look when the first real thread renders "we have not read this yet" forever.
 * Re-tier to `[LIVE]` once a real payload is seen.
 */
const INBOUND = 'inbound'

/**
 * The newest inbound message in a page, which is what a send window is measured from.
 *
 * Returns `null` when the page holds no inbound message — a genuine "we do not know",
 * which `evaluateSendWindow` turns into the `unknown` affordance rather than guessing.
 * Order is not assumed; the messages are scanned.
 */
export function newestInboundAt(messages: readonly ZernioMessage[]): string | null {
  let newest: string | null = null
  let newestMs = Number.NEGATIVE_INFINITY
  for (const m of messages) {
    if (m.direction !== INBOUND || !m.createdAt) continue
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
