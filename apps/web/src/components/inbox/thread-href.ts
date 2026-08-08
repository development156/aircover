import type { Route } from 'next'

/**
 * The URL for one thread.
 *
 * ── WHY TWO SEGMENTS AND NOT ONE ─────────────────────────────────────────────
 * A thread is `(conversationId, accountId)`. Zernio resolves a conversation id only
 * WITHIN an account, so `/inbox/threads/[id]` would carry half a key and the read would
 * land against whichever account matched — across tenants, since Zernio's profile
 * filters default to every profile on the API key.
 *
 * Two path segments make the pair structural rather than conventional: a link that
 * forgets the account cannot be built, and a hand-typed URL that omits it 404s at the
 * router instead of reading the wrong account. No encoding scheme to get wrong either.
 */
export function threadHref({
  accountId,
  conversationId,
}: {
  accountId: string
  conversationId: string
}): Route {
  return `/inbox/threads/${encodeURIComponent(accountId)}/${encodeURIComponent(conversationId)}` as Route
}
