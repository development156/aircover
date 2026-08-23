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

export function mapPostError(
  error: { message?: string | null; code?: string | null } | null | undefined,
): string {
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
