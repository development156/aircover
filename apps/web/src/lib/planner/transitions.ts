import type { PostStatus } from '@sahoda/shared'

/**
 * The ONLY status transition apps/web may write is approve, and only from
 * these states. `savePost` deliberately refuses `status` entirely (the
 * anti-fabricated-publish guard, `actions/posts.ts`); this allowlist is the one
 * sanctioned exception, checked both here (UI) and in the action's SQL filter
 * (`.in('status', APPROVABLE_FROM)`) so a race cannot approve past a
 * publish-pipeline state.
 */
export const APPROVABLE_FROM = ['idea', 'draft', 'review'] as const satisfies readonly PostStatus[]

export function canApprove(status: PostStatus): boolean {
  return (APPROVABLE_FROM as readonly PostStatus[]).includes(status)
}
