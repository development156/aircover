import 'server-only'

import type { Post } from '@sahoda/shared'

import { readInstagramAnalytics, type AccountAnalytics } from '@/lib/analytics/account-insights'
import { listPostMetrics } from '@/lib/analytics/post-metrics'
import type { ComparableRow } from '@/lib/analytics/compare'
import { listPosts, listVariantStates } from '@/lib/posts/read'

/**
 * Everything the analytics page renders, read once.
 *
 * ── WHY THE ASSEMBLY IS ITS OWN MODULE ───────────────────────────────────────
 * The page compares posts against each other, and a comparison is only as honest as
 * the population it was drawn from. That population is decided HERE — which posts
 * are in scope, which channels of them, and what is left out — so the decision is
 * one testable function rather than a filter buried in JSX.
 *
 * The rule it follows: a channel is in scope if it PUBLISHED. Not "if it has
 * metrics" — that would silently define the population as "the posts that reported",
 * making every coverage figure downstream read 100% and every gap invisible. The
 * denominator has to include the rows that have nothing to say.
 *
 * NEVER REJECTS, for the same reason `listPostMetrics` does not: the analytics page
 * is a read-only view and a hiccup in any one of its three reads must cost that
 * section, not the page.
 */

/**
 * Most metric calls this page may make.
 *
 * Higher than the posts LIST (6) and the detail view (8), because this is the page
 * whose entire purpose is the comparison — a cap that quietly halves the population
 * would make every total on it a subtotal. Still bounded: Zernio rate-limits at
 * 60/min and `listPostMetrics` runs these four at a time.
 *
 * Rows past the cap come back `not-loaded`, which the comparison counts in its
 * denominator and never in its total. A truncated population is stated, not hidden.
 */
export const ANALYTICS_METRIC_CALLS = 24

export interface AnalyticsPageData {
  /** Every published channel of every post in the window, with its verdict. */
  rows: ComparableRow[]
  /** Posts that have at least one published channel. For the "how many" line. */
  posts: Post[]
  account: AccountAnalytics
  /**
   * True when the workspace has posts but none of them has published anywhere.
   *
   * Kept apart from `rows.length === 0` by the caller's reading of `posts`: a
   * workspace with drafts and a workspace with nothing at all deserve different
   * words, and neither deserves an empty table.
   */
  hasPublished: boolean
}

/** A post with nothing published has no analytics, and is not a gap in any total. */
function titleOf(post: Post): string {
  const title = post.title?.trim()
  if (title) return title
  const body = post.body?.trim()
  if (body) return body.length > 60 ? `${body.slice(0, 60)}…` : body
  return 'Untitled post'
}

/**
 * The account half, on its own and total.
 *
 * Its own function rather than a branch inside the post half's `try`, and that is
 * the whole point: with both under one `try`, a throw from the POST side lands in a
 * catch that has no account value in scope and has to invent one — reporting
 * "couldn't read your account insights" about a connection that answered perfectly.
 * Independence stated in a comment is independence one refactor away from being
 * untrue; here the two cannot reach each other's failure.
 */
async function readAccount(now: Date): Promise<AccountAnalytics> {
  try {
    return await readInstagramAnalytics(now)
  } catch {
    return { kind: 'unreadable' }
  }
}

export async function readAnalyticsPage(now: Date = new Date()): Promise<AnalyticsPageData> {
  // Both are total, so both can be awaited together and neither can reject. The
  // account value is in scope for every return below, including the catch.
  const [account, posts] = await Promise.all([readAccount(now), listPosts().catch(() => [])])

  const empty: AnalyticsPageData = { rows: [], posts: [], account, hasPublished: false }

  try {
    if (posts.length === 0) return empty

    const variantStates = await listVariantStates(posts.map((post) => post.id))

    // Scope = every channel that PUBLISHED. Deliberately not "every channel with a
    // platform id": a published channel whose id never arrived is a real gap in the
    // picture, and dropping it here would erase it from every denominator below.
    const published = new Map(
      [...variantStates].map(
        ([postId, rows]) => [postId, rows.filter((row) => row.status === 'published')] as const,
      ),
    )
    const inScope = new Map([...published].filter(([, rows]) => rows.length > 0))

    if (inScope.size === 0) {
      return { rows: [], posts, account, hasPublished: false }
    }

    const metrics = await listPostMetrics(inScope, now, ANALYTICS_METRIC_CALLS)
    const titles = new Map(posts.map((post) => [post.id, titleOf(post)]))

    /**
     * `(postId, channel)` is unique across these rows, and downstream depends on it
     * in three places at once: it is the React key in both of `post-table`'s lists,
     * `totalFor` would double-count a repeat, and `coverageFor`'s `of: rows.length`
     * would inflate its own denominator.
     *
     * Not defended here because it cannot be violated: `post_variants` carries
     * `unique (post_id, channel)` (20260718000004_content.sql), so a second row for
     * one channel of one post is not expressible. Written down because SL-076 was
     * exactly this class of defect one commit ago, and the next reader deserves to
     * know the guarantee is the database's rather than assume it is nobody's.
     */
    const rows: ComparableRow[] = []
    for (const [postId, channelMetrics] of metrics) {
      for (const entry of channelMetrics) {
        rows.push({
          postId,
          title: titles.get(postId) ?? 'Untitled post',
          channel: entry.channel,
          state: entry.state,
        })
      }
    }

    return {
      rows,
      posts: posts.filter((post) => inScope.has(post.id)),
      account,
      hasPublished: true,
    }
  } catch (error) {
    console.error('[analytics] page read threw', error instanceof Error ? error.message : 'unknown')
    return empty
  }
}
