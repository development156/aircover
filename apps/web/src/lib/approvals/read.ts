import 'server-only'

import { cache } from 'react'

import { forDisplay } from '@/lib/posts/display-post'
import { readPosts } from '@/lib/posts/read'
import { splitQueue, type ApprovalQueue } from '@/lib/approvals/queue'

/**
 * THE ONE READ BEHIND THE BADGE, THE QUEUE AND HOME'S COUNT.
 *
 * ── WHY `cache()` IS LOAD-BEARING HERE AND NOT AN OPTIMISATION ───────────────
 * The rail renders inside the `(app)` LAYOUT and `/approvals` renders inside the
 * page. Those are two component trees in one request, and without React's
 * `cache` they would each issue their own `posts` select. Two selects a
 * millisecond apart can return different rows — a colleague approving something
 * in between is the ordinary case, not the exotic one — and the badge would then
 * say 5 while the header it labels says 4.
 *
 * That is the failure `nav-item.tsx` predicted in prose ("a separate
 * pendingCount field will eventually disagree with it"). A second QUERY is the
 * same defect as a second field; `cache` is what makes "one collection" true at
 * runtime rather than merely intended. `read-brain.ts` wraps `activeWorkspaceId`
 * for the same reason.
 *
 * ── THREE ANSWERS, NOT AN EMPTY LIST ─────────────────────────────────────────
 * Inherited from `readPosts`, deliberately. "Nothing is waiting on you" and "we
 * could not read what is waiting on you" are different sentences, and an empty
 * queue rendered for a failed read is the one shape that makes a false claim
 * look like a designed screen.
 */
export type ApprovalRead =
  ({ status: 'ok' } & ApprovalQueue) | { status: 'no-workspace' } | { status: 'unreadable' }

export const readApprovalQueue = cache(async (): Promise<ApprovalRead> => {
  const read = await readPosts()
  if (read.status !== 'ok') return { status: read.status }
  return { status: 'ok', ...splitQueue(read.posts.map(forDisplay)) }
})

/**
 * The badge's number, or `undefined`.
 *
 * ── WHY `undefined` AND NOT `0` ON A FAILED READ ─────────────────────────────
 * `NavItem` renders nothing for a zero count, which is right: a "0" badge is
 * noise. But returning 0 when the read FAILED would render the same nothing for
 * a different reason — the rail would silently claim nothing is waiting while
 * five things are. `undefined` reaches the same visual outcome by the honest
 * route, and it means the badge never asserts a number it did not count.
 *
 * The rail must not break either way: a failed posts read costs one badge and
 * nothing else, the same rule `showsAdminItem` follows. A layout's throw does
 * not reach the segment error boundary — it reaches global-error and replaces
 * the document.
 */
export async function approvalCount(): Promise<number | undefined> {
  try {
    const read = await readApprovalQueue()
    return read.status === 'ok' ? read.total : undefined
  } catch {
    return undefined
  }
}
