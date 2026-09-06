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

export function mapPostError(
  error: { message?: string | null; code?: string | null } | null | undefined,
): string {
  if (error?.message?.includes(LIFECYCLE_ROLE_TOKEN)) return LIFECYCLE_ROLE_COPY

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
