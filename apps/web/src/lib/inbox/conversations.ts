import 'server-only'

import type { ZernioConversation } from '@sahoda/publishing'

import { countAccounts, readConversations } from './read'
import type { StoreDecision } from './store-decision'
import { readStoredThreads } from './store-read'

/**
 * The conversations list, assembled the way the founder chose on 2026-08-21:
 * **stored events are authoritative; the live Zernio read is a history supplement.**
 *
 * ── WHY BOTH, AND NOT JUST THE STORE ─────────────────────────────────────────
 * Webhooks deliver only what happens AFTER the subscription exists, and Zernio's API
 * has no replay endpoint — checked across all 399 paths (docs/29 §0). Cutting the
 * live read outright would therefore make every conversation older than the
 * subscription vanish from the screen on the day this ships. That is a visible
 * regression, not a migration.
 *
 * ── THE ORDER IS THE WHOLE DESIGN ────────────────────────────────────────────
 * The store is read FIRST and unconditionally. The supplement is attempted second,
 * and its ONLY effects are (a) adding older rows and (b) setting a flag that turns
 * one sentence on. It can fail, hang or return nonsense and the page still renders
 * everything the store holds.
 *
 * A supplement whose failure could throw would just be the old design with extra
 * steps — so nothing here rethrows, and `readConversations` already answers a
 * `SurfaceDecision` instead of throwing on a failed read.
 */

export interface ConversationsView {
  /**
   * The list, in the shape the existing `ConversationList` already renders.
   *
   * Mapped from the store rather than the component being rewritten, because the
   * component's filtering, channel chips and empty line are all tested and none of
   * that changes — only where the rows come from. `accountId` is the one field the
   * store cannot supply (a thread is keyed by conversation, not by account) and it
   * is left EMPTY rather than filled with the thread id: the list does not read it,
   * and a plausible wrong value is worse than an obviously absent one.
   */
  rows: ZernioConversation[]
  decision: StoreDecision
  /**
   * Rows that exist only on the platform, fetched live. Zero when Zernio could not
   * be reached — which the decision's `ok_history_unavailable` state announces.
   */
  historyRows: number
}

/** Zernio's platform vocabulary, restored for the row the list renders. */
const PLATFORM: Readonly<Record<string, string>> = {
  x: 'twitter',
  gbp: 'googlebusiness',
  instagram: 'instagram',
  linkedin: 'linkedin',
}

export async function readConversationsList(): Promise<ConversationsView> {
  const connectedAccounts = await countAccounts('conversations')

  // ── THE SUPPLEMENT ────────────────────────────────────────────────────────
  // Attempted, never depended on. `historyAvailable` is a THREE-valued signal:
  // true (fetched), false (tried and failed), undefined (not attempted because
  // nothing is connected, so there is nothing to be missing).
  let historyAvailable: boolean | undefined
  let historyRows = 0

  if (connectedAccounts > 0) {
    try {
      const live = await readConversations()
      // `showList` false means the classifier has DISOWNED those rows — it could not
      // confirm the read. Treating that as a successful history fetch would put a
      // clean "Showing your conversations" on a page whose older half is unknown.
      historyAvailable = live.decision.showList
      historyRows = live.decision.showList ? live.rows.length : 0
    } catch {
      // Cannot happen through `readConversations`, which classifies rather than
      // throws — but a future refactor must not be able to take the page down by
      // changing that, so the guarantee is enforced here rather than assumed there.
      historyAvailable = false
    }
  }

  const view = await readStoredThreads('conversations', { connectedAccounts, historyAvailable })

  return {
    rows: view.rows.map((r) => ({
      id: r.platformThreadId,
      platform: PLATFORM[r.channel] ?? r.channel,
      accountId: '',
      participantName: r.authorName ?? undefined,
      accountUsername: r.authorHandle ?? undefined,
      lastMessage: r.preview ?? undefined,
      updatedTime: r.postedAt ?? undefined,
      status: r.status,
    })),
    decision: view.decision,
    historyRows,
  }
}
