/**
 * Map a PostgREST error on `campaigns` / `campaign_posts` to user-safe copy.
 *
 * Allowlist-only, and the driver's own message is never interpolated — a
 * single-line Postgres error reads exactly like prose, so a denylist of
 * "internal-looking" substrings is not defensible. Same rule as `mapPostError`.
 *
 * `23505` is the one worth branching per table. On `campaigns` it is the
 * `(workspace_id, name)` unique index and it names a mistake the customer can
 * fix in one keystroke; on `campaign_posts` it is `(campaign_id, post_id)`,
 * which means the post is already in — not an error the customer caused, and
 * not one they should be shown as a failure.
 */
const GENERIC = 'Could not save this campaign. Try again.'

export function mapCampaignError(
  error: { message?: string | null; code?: string | null } | null | undefined,
): string {
  switch (error?.code) {
    case '23505':
      return 'A campaign with that name already exists — pick another name.'

    // 23514 check_violation — the status vocabulary, or a name that is only
    // whitespace, or an end date before the start date.
    case '23514':
      return 'Check the name, the status and the dates — one of them is not allowed.'

    // 23503 foreign_key_violation — the campaign or the post went away mid-edit.
    case '23503':
      return 'That campaign or post no longer exists — reload to see the current list.'

    // No rows and an RLS refusal must read IDENTICALLY, so a non-member cannot
    // learn whether a campaign id exists.
    case 'PGRST116':
    case '42501':
      return "You don't have access to this campaign."

    default:
      return GENERIC
  }
}

/** The duplicate-membership case, which is a no-op rather than a failure. */
export function isAlreadyMember(error: { code?: string | null } | null | undefined): boolean {
  return error?.code === '23505'
}
