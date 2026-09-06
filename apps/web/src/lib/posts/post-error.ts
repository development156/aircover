/**
 * Map a PostgREST error on `posts` / `post_variants` / `post_media` to user-safe
 * copy. Everything unrecognised — and every raw SQL string — collapses to one
 * generic line, so no database internals reach the UI.
 *
 * Deliberately allowlist-only: we branch on a small set of known SQLSTATEs and
 * never interpolate the driver's message. A denylist of "internal-looking"
 * substrings is not defensible — a single-line Postgres error looks exactly like
 * prose.
 */
const GENERIC = 'Could not save this post. Try again.'

/**
 * The lifecycle trigger on `posts` raises this exact token when a PostgREST
 * role tries to move `status` past idea/draft/review, change `scheduled_at`
 * without being an owner or editor, or write `approved_by` / `approved_at`
 * by hand. It arrives as a P0001 raise, so the CODE says nothing; the token
 * is matched by substring and never echoed.
 */
const LIFECYCLE_ROLE_TOKEN = 'POST_LIFECYCLE_ROLE'
export const LIFECYCLE_ROLE_COPY =
  'Only an owner or editor can change when this goes out, or move it along. Ask one of them.'

/**
 * The review gate's own raises (`send_post_for_review`, `return_post_to_draft`,
 * `approve_posts`, and the delete trigger). Each is a bare token in a P0001
 * message, and each is a different situation with a different remedy, so each
 * gets its own sentence. ONE table, read by `posts-review.ts` and by this
 * mapper, so the composer and the queue cannot describe one refusal two ways.
 *
 * `POST_HAS_PUBLISH_EVIDENCE` is the delete refusal: a post that went out on a
 * channel keeps its row, because the row is the only record of what was said
 * where. "Could not save" over that would be the vaguer sentence.
 */
export const REVIEW_REFUSALS: ReadonlyArray<readonly [token: string, copy: string]> = [
  ['POST_NOT_SUBMITTABLE', 'Only a draft can be sent for review. This post has already moved on.'],
  ['POST_NOT_RETURNABLE', 'This post is not waiting on anyone, so there is nothing to send back.'],
  [
    'POST_ALREADY_GOING_OUT',
    'This post is already going out on a channel, so it cannot be sent back. Wait for it to finish.',
  ],
  ['REASON_REQUIRED', 'Say in a sentence what should change, so the writer knows what to do.'],
  [
    'POST_HAS_PUBLISH_EVIDENCE',
    'This post already went out on a channel, so it cannot be deleted. Its record stays.',
  ],
]

/** The sentence for a review-gate token found in `raised`, or null. */
export function reviewRefusalFor(raised: string | null | undefined): string | null {
  if (!raised) return null
  const hit = REVIEW_REFUSALS.find(([token]) => raised.includes(token))
  return hit ? hit[1] : null
}

export function mapPostError(
  error: { message?: string | null; code?: string | null } | null | undefined,
): string {
  if (error?.message?.includes(LIFECYCLE_ROLE_TOKEN)) return LIFECYCLE_ROLE_COPY
  const review = reviewRefusalFor(error?.message)
  if (review !== null) return review

  switch (error?.code) {
    // 23514 check_violation — the only user-fixable one we raise: posts.status
    // and post_variants.publish_status both carry CHECK constraints.
    case '23514':
      return 'That status is not allowed for this post. Reload and try again.'

    // 23505 unique_violation — (post_id, channel) on post_variants.
    case '23505':
      return 'That channel already has a variant on this post. Reload and try again.'

    // 23503 foreign_key_violation — the post or workspace went away mid-edit.
    case '23503':
      return 'That post no longer exists. Reload to see the current list.'

    // PGRST116 (no rows) and 42501 (RLS refusal) must read IDENTICALLY: a
    // non-member must not be able to learn whether a post id exists.
    case 'PGRST116':
    case '42501':
      return "You don't have access to this post."

    default:
      return GENERIC
  }
}
