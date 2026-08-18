'use client'

import type { PostDraft } from './use-autosave'

/**
 * A crash buffer for the post being edited.
 *
 * ── WHY A LOCAL COPY AND NOT A BETTER FLUSH ──────────────────────────────────
 * Everything typed inside the 2s autosave debounce was lost to a browser Back,
 * and three attempts to save on the way out all failed for the same measured
 * reason: the request is issued and then killed.
 *
 *   CONSOLE AFTER BACK -> []                       the cleanup never runs —
 *                                                  Next keeps the segment in its
 *                                                  router cache and no teardown
 *                                                  hook of any kind fires
 *   REQ  /posts/<id> :: {"body":"EDITOR TEXT…"}    popstate DOES fire, and the
 *                                                  action goes out with the right
 *                                                  words
 *   FAILED /posts/<id> :: net::ERR_ABORTED         and the navigation cancels it
 *
 * A server action cannot outlive the navigation that triggered it. So the answer
 * is not a better moment to send — it is to stop needing the network at all at
 * that moment. Every keystroke is written HERE, synchronously, where nothing can
 * abort it, and the next mount hands it back.
 *
 * ── WHAT THIS IS NOT ─────────────────────────────────────────────────────────
 * Not a second source of truth. The row stays authoritative: this holds one
 * post's in-progress text for the length of a tab, is cleared the moment the
 * server confirms a write, and is only ever consulted when it disagrees with
 * what the row returned. It cannot be stale in a way that matters, because a
 * confirmed save deletes it.
 *
 * `sessionStorage`, not `localStorage`: this is a crash buffer for THIS tab's
 * session, not a synced draft. Two tabs must not hand each other bodies behind
 * the customer's back — that is the concurrent-edit problem, and it has its own
 * plan (docs/23_Concurrent_Edit_Plan.md), not a storage side-channel.
 */

const KEY_PREFIX = 'sahoda.draft.'

/** Bounded so a runaway paste cannot fill the quota and break the tab. */
const MAX_STASH_BYTES = 200_000

function keyFor(postId: string): string {
  return `${KEY_PREFIX}${postId}`
}

/**
 * Every storage call is guarded. `sessionStorage` throws on access in a
 * partitioned or storage-blocked context (Safari private mode, an embedded
 * frame), and a recovery buffer that can take the editor down is worse than no
 * recovery buffer.
 */
export function stashDraft(postId: string, draft: PostDraft): void {
  try {
    const payload = JSON.stringify(draft)
    if (payload.length > MAX_STASH_BYTES) return
    sessionStorage.setItem(keyFor(postId), payload)
  } catch {
    // No buffer available. The debounced save is still the primary path.
  }
}

export function readStash(postId: string): PostDraft | null {
  try {
    const raw = sessionStorage.getItem(keyFor(postId))
    if (raw === null) return null
    const parsed: unknown = JSON.parse(raw)
    // Shape-checked rather than cast: this came from storage, which anything on
    // the origin can write, and a malformed object here would reach `savePost`.
    if (typeof parsed !== 'object' || parsed === null) return null
    const draft = parsed as Partial<PostDraft>
    if (typeof draft.title !== 'string' || typeof draft.body !== 'string') return null
    if (!Array.isArray(draft.channels)) return null
    if (draft.scheduledAt !== null && typeof draft.scheduledAt !== 'string') return null
    return {
      title: draft.title,
      body: draft.body,
      channels: draft.channels as PostDraft['channels'],
      scheduledAt: draft.scheduledAt,
    }
  } catch {
    return null
  }
}

export function clearStash(postId: string): void {
  try {
    sessionStorage.removeItem(keyFor(postId))
  } catch {
    // Nothing to do — see stashDraft.
  }
}
