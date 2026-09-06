import { revalidatePath } from 'next/cache'

/**
 * Every screen that shows a post's intent, refreshed together.
 *
 * ── WHY ONE LIST ─────────────────────────────────────────────────────────────
 * Approving from the planner refreshed the planner and Posts; approving from
 * Approvals refreshed those two plus Approvals and Home. Same status write,
 * two lists, and the shorter one left the Approvals queue and the Home count
 * holding the old number until a reload. Scheduling from the composer had a
 * third list. One function, so the next surface that reads a post's intent is
 * added here once and every writer picks it up.
 *
 * `postId` adds the post's own screen, which the schedule actions revalidate
 * because the composer shows the time it just set.
 */
export const POST_SURFACES = ['/posts', '/planner', '/approvals', '/home'] as const

export function revalidatePostSurfaces(postId?: string): void {
  for (const path of POST_SURFACES) revalidatePath(path)
  if (postId !== undefined) revalidatePath(`/posts/${postId}`)
}
