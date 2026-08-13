/**
 * MUTANTS. Every expression below MUST be a type error.
 *
 * This directory is deliberately OUTSIDE `apps/web/tsconfig.json`'s `include`,
 * so `turbo typecheck` never compiles it. `display-post.guard.test.ts` compiles
 * it on purpose and fails if any of these stops erroring — which is what would
 * happen if someone "simplified" `DisplayPost` back to carrying a plain
 * `status`, or made an evidence prop optional again.
 *
 * A guard nobody can break is worth nothing if nothing proves it still bites.
 */
import type { Post } from '@sahoda/shared'

import type { DisplayPost } from '@/lib/posts/display-post'
import type { StatusBadgeProps } from '@/components/posts/status-badge'
import type { PostCardProps } from '@/components/posts/post-card'

declare const raw: Post
declare const shown: DisplayPost

// M1 — the third instance, in its natural form: reading the post row to decide
// what the post DID. Was a silently-false comparison; must be an error.
export const m1 = shown.status === 'published'

// M2 — smuggling the column into something that wants a PostStatus.
declare function wantsStatus(s: Post['status']): void
export const m2 = wantsStatus(shown.status)

// M3 — handing a raw row straight to a rendering slot, skipping `forDisplay`.
export const m3: DisplayPost = raw

// M4 — the obvious way around M3: spread the row and bolt `intent` on. The
// column rides along and must still be rejected.
export const m4: DisplayPost = { ...raw, intent: raw.status }

// M5 — the evidence prop going optional again. `lagHours?` and `simulated?`
// produced two defects in two days; an omitted `outcome` would silently fall
// back to the stale intent word.
export const m5: StatusBadgeProps = { intent: 'approved' }

// M6 — the same shape one layer up, on the card.
export const m6: Omit<PostCardProps, 'post' | 'metrics'> = { now: new Date() }
