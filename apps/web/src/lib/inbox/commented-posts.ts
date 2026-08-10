import type { ZernioCommentedPost } from '@sahoda/publishing'

/**
 * What the comments surface may show, out of what `GET /inbox/comments` sends.
 *
 * ── WHY A FILTER EXISTS AT ALL `[LIVE 2026-08-10]` ───────────────────────────
 * The endpoint is named for comments and returns POSTS — every post, including ones
 * with none. The first real page held six posts and two comments, both on one post.
 *
 * Rendering that page as-is makes two false claims at once: five rows on a screen
 * headed "comments" that have no comments to open, and — because `rows > 0` is then
 * always true — the headline "Showing your comments" for a workspace that has never
 * received one. `classifyInboxResult`'s "No comments yet" branch becomes unreachable,
 * which is the state it was written to produce.
 *
 * So the surface counts and shows comment-carrying posts, and `withoutComments` records
 * what was left out rather than dropping it silently.
 *
 * Pure and separate from `./read` so this is testable without a Zernio key — the
 * decision here is about what the screen is entitled to claim, which is exactly the
 * kind of thing that should not need a network call to verify.
 */
export interface CommentedPostsView {
  /** Posts that actually carry at least one comment, in the order Zernio sent them. */
  posts: ZernioCommentedPost[]
  /** How many rows were dropped for carrying none. Reported, never merely discarded. */
  withoutComments: number
}

export function postsCarryingComments(
  rows: readonly ZernioCommentedPost[],
): CommentedPostsView {
  // `> 0` rather than truthiness: a count that is absent, negative or not a number is
  // not evidence of a comment, and treating it as one turns a zero into a claim.
  const posts = rows.filter((p) => Number.isFinite(p.commentCount) && p.commentCount > 0)
  return { posts, withoutComments: rows.length - posts.length }
}
