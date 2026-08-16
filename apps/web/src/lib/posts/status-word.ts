import type { PostStatus } from '@sahoda/shared'

/**
 * The WORD for each post status, with no styling attached.
 *
 * Split out of `status-badge.tsx` so that a second surface — Home's "needs your
 * attention" queue — can say "In review" without also inheriting the badge's
 * certainty signature. The label and the treatment are different decisions and
 * were entangled while only one screen showed status.
 *
 * `satisfies Record<PostStatus, string>` so a new value in `PostStatusSchema`
 * is a compile error here rather than a chip that silently renders its own
 * enum key at a user.
 */
export const STATUS_WORD = {
  idea: 'Idea',
  draft: 'Draft',
  review: 'In review',
  approved: 'Approved',
  scheduled: 'Scheduled',
  publishing: 'Publishing',
  published: 'Published',
  partial: 'Partly published',
  failed: 'Failed',
  expired: 'Expired',
} satisfies Record<PostStatus, string>
