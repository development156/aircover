import type { Route } from 'next'

import type { InboxListRow } from '@/lib/inbox/list-row'

/**
 * The URL for one thread. There are TWO shapes, because there are two ways to name
 * a thread and only one of them needs a Zernio account.
 *
 * ── WHY THE LIVE SHAPE HAS TWO SEGMENTS ──────────────────────────────────────
 * A live thread is `(conversationId, accountId)`. Zernio resolves a conversation id
 * only WITHIN an account, so `/inbox/threads/[id]` would carry half a key and the read
 * would land against whichever account matched — across tenants, since Zernio's profile
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

/**
 * The STORED shape: our own `inbox_threads.id`, and no account at all.
 *
 * A thread this database holds needs no Zernio account to be read — it is our row,
 * scoped by RLS and by an explicit `workspace_id` filter, and the id is used as a
 * QUERY FILTER against this workspace's rows rather than as something to trust. So
 * one segment is a whole key here, where on the live route it would be half of one.
 *
 * `store` is a literal segment and Zernio account ids are 24 lowercase hex
 * characters, so this route and the two-segment one cannot collide.
 */
export function storedThreadHref(threadId: string): Route {
  return `/inbox/threads/store/${encodeURIComponent(threadId)}` as Route
}

/**
 * Where a list row goes, or `null` when it goes nowhere.
 *
 * ── THE ROW THAT USED TO GO NOWHERE ──────────────────────────────────────────
 * A stored thread carries no account of its own; `lib/inbox/conversations.ts`
 * resolves one through this workspace's connections and leaves it EMPTY when no
 * connected account on that channel can say. MEASURED 2026-09-06 on the wt-core
 * preview: the row rendered `<a href="/inbox/threads//qa-thread-1">` and the click
 * landed on "This page isn't here", so the link was replaced with a sentence.
 *
 * The sentence was the right fix for a door that opened on a wall and the WRONG fix
 * for this row, because the message is in this database and can be read without any
 * account at all. So the account-less row now goes to the store route, and `null`
 * is left for the only case that genuinely has no destination: a row with neither
 * an account nor a row id of ours, which is a live row Zernio sent without one.
 */
export function conversationHref(row: InboxListRow): Route | null {
  if (row.accountId !== '') {
    return threadHref({ accountId: row.accountId, conversationId: row.id })
  }
  return row.storedThreadId ? storedThreadHref(row.storedThreadId) : null
}
