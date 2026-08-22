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
 * live read outright would make every conversation older than the subscription
 * vanish the day this ships. That is a visible regression, not a migration.
 *
 * AND IT IS NOT HYPOTHETICAL TODAY. No subscription is registered yet, so the store
 * is empty for every workspace: right now the supplement is supplying ALL of it. The
 * first version of this file counted the live rows and returned only the number,
 * which would have shown a customer with two hundred conversations the sentence
 * "Nothing has come through yet" — permanently, since nothing backfills. The test
 * that catches it is `page.test.tsx`'s "SHOWS existing conversations when the store
 * is empty and Zernio answers", and it was written before this file was fixed.
 *
 * ── THE ORDER IS THE DESIGN ──────────────────────────────────────────────────
 * Stored rows come FIRST and win every collision: where both halves know a thread,
 * the store's copy is the one an arriving event keeps current, and the live copy is
 * a snapshot of whenever the page was rendered.
 *
 * ── THE SUPPLEMENT IS BOUNDED, NOT MERELY CAUGHT ─────────────────────────────
 * An unreachable host HANGS; it does not reject promptly. A `try/catch` around an
 * unbounded await is no protection at all — the server component simply never
 * finishes rendering, which is worse than an error because nothing reports it. So
 * the supplement races a deadline, and a deadline that expires is treated exactly
 * like a failure: `historyAvailable: false`, one extra sentence on screen, and the
 * stored rows rendered regardless.
 */

export interface ConversationsView {
  /**
   * The list, in the shape the existing `ConversationList` already renders.
   *
   * Mapped from the store rather than the component being rewritten: the component's
   * filtering, channel chips and empty line are all tested and none of that changes
   * — only where the rows come from. `accountId` is the one field the store cannot
   * supply (a thread is keyed by conversation, not by account) and it is left EMPTY
   * rather than filled with the thread id. The list does not read it, and a plausible
   * wrong value is worse than an obviously absent one.
   */
  rows: ZernioConversation[]
  decision: StoreDecision
  /** How many rows came from the live read rather than the store. */
  historyRows: number
}

/** Zernio's platform vocabulary, restored for the row the list renders. */
const PLATFORM: Readonly<Record<string, string>> = {
  x: 'twitter',
  gbp: 'googlebusiness',
  instagram: 'instagram',
  linkedin: 'linkedin',
}

/**
 * How long the supplement may take before the page gives up on it.
 *
 * Two seconds. The store path is a single indexed query and costs single-digit
 * milliseconds, so this is the entire perceived cost of Zernio being unwell — and
 * the page still renders everything the store holds when it expires. Longer would
 * make a dead host feel like a broken product; shorter would drop a merely slow
 * answer that was about to arrive.
 */
const SUPPLEMENT_DEADLINE_MS = 2_000

/** The live read, bounded. Resolves to null on failure OR on timeout — both are "no history". */
async function historyWithin(ms: number): Promise<ZernioConversation[] | null> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    const deadline = new Promise<null>((resolve) => {
      timer = setTimeout(() => resolve(null), ms)
    })
    const live = await Promise.race([readConversations(), deadline])
    if (live === null) return null
    // `showList` false means the classifier has DISOWNED those rows — it could not
    // confirm the read. Treating that as a successful history fetch would put a clean
    // "Showing your conversations" on a page whose older half is unknown.
    return live.decision.showList ? live.rows : null
  } catch {
    return null
  } finally {
    // The timer must be cleared on the fast path too, or a serverless invocation is
    // held open for two seconds after it has already answered.
    if (timer !== undefined) clearTimeout(timer)
  }
}

export async function readConversationsList(): Promise<ConversationsView> {
  const connectedAccounts = await countAccounts('conversations')

  // Attempted, never depended on. `historyAvailable` is THREE-valued: true
  // (fetched), false (tried and failed or timed out), undefined (not attempted,
  // because nothing is connected and so nothing can be missing).
  // `connectedAccounts` is THREE-valued and `null > 0` is silently false, which
  // would read a FAILED count as "nothing is connected". Spelled out so the
  // null arm is a decision rather than a coercion: we did not count, so we do
  // not attempt the supplement, and `decide()` renders the sentence for a count
  // we could not take rather than one for an empty account.
  const history =
    connectedAccounts !== null && connectedAccounts > 0
      ? await historyWithin(SUPPLEMENT_DEADLINE_MS)
      : undefined
  const historyAvailable = history === undefined ? undefined : history !== null
  const historyRows = history?.length ?? 0

  const view = await readStoredThreads('conversations', {
    connectedAccounts,
    historyAvailable,
    historyRows,
  })

  const stored: ZernioConversation[] = view.rows.map((r) => ({
    id: r.platformThreadId,
    platform: PLATFORM[r.channel] ?? r.channel,
    accountId: '',
    participantName: r.authorName ?? undefined,
    accountUsername: r.authorHandle ?? undefined,
    lastMessage: r.preview ?? undefined,
    updatedTime: r.postedAt ?? undefined,
    status: r.status,
  }))

  // Deduped ONCE, here, at the boundary that produces the list — this repo has
  // shipped three separate defects from reading a collection as if it were already a
  // set. The store wins a collision because its row is the one events keep current.
  const seen = new Set(stored.map((r) => r.id))
  const older = (history ?? []).filter((r) => !seen.has(r.id))

  return { rows: [...stored, ...older], decision: view.decision, historyRows }
}
