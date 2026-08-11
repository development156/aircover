'use server'

import { auth } from '@clerk/nextjs/server'

import { buildPublishSnapshot } from '@/lib/posts/build-snapshot'
import { LIST_LIMIT } from '@/lib/posts/read'
import type { PublishSnapshot } from '@/lib/posts/live-state'

/**
 * The polled read behind live publish state.
 *
 * ── WHY AN ACTION AND NOT A ROUTE ────────────────────────────────────────────
 * Every other mutation and read on these surfaces is a server action, and this
 * one needs exactly the same things: the Clerk session, the active workspace,
 * and RLS underneath. A bespoke route handler would be a second authentication
 * path to keep in step with the first.
 *
 * ── WHAT IT COSTS ────────────────────────────────────────────────────────────
 * Three queries against our own Postgres, all workspace-scoped and all batched
 * for the whole page. ZERO Zernio calls. That is the property the caller's
 * cadence depends on: `listPostMetrics` would spend six calls of a 60/min budget
 * shared with analytics and the inbox, so anything that re-rendered the page
 * would be unaffordable on a five-second timer. This is affordable precisely
 * because it refuses to fetch metrics — and the metrics already on screen are
 * left exactly as the server rendered them, rather than being blanked by a
 * refresh that could not afford to re-fetch them.
 *
 * ── FAILURE IS SILENCE, NOT AN EMPTY SCREEN ──────────────────────────────────
 * A signed-out or workspace-less caller gets an empty snapshot, and every read
 * inside degrades to empty on error. The client treats an empty snapshot as "no
 * news", never as "everything reset" — a poll that cannot read must leave the
 * last known state standing. A live region that blanks on a hiccup would report
 * a published post as unknown.
 */
export async function readPublishState(postIds: unknown): Promise<PublishSnapshot> {
  const readAt = new Date().toISOString()
  try {
    const { userId } = await auth()
    if (!userId) return { posts: [], readAt }

    // `postIds` crosses a server-action boundary, so it is whatever the caller
    // sent. Narrowed rather than trusted, and capped at the same `LIST_LIMIT`
    // the list itself uses so a hand-rolled call cannot turn one poll into an
    // unbounded `in (...)` against the posts table.
    if (!Array.isArray(postIds)) return { posts: [], readAt }
    const ids = postIds.filter((id): id is string => typeof id === 'string').slice(0, LIST_LIMIT)
    if (ids.length === 0) return { posts: [], readAt }

    return await buildPublishSnapshot(ids)
  } catch {
    // Deliberately quiet and deliberately empty. This runs on a timer; a failing
    // poll that logged every tick would bury the log it was trying to help with,
    // and one that threw would surface a page-level error over a post the writer
    // can still read perfectly well.
    return { posts: [], readAt }
  }
}
