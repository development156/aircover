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

export async function readAnalyticsPage(now: Date = new Date()): Promise<AnalyticsPageData> {
  const empty: AnalyticsPageData = {
    rows: [],
    posts: [],
    account: { kind: 'unreadable' },
    hasPublished: false,
  }

  try {
    // The account half is independent of the post half — a broken Instagram
    // connection must not empty the post table, and vice versa. Settled rather
    // than awaited together so one rejection cannot take the other down.
    const [postsResult, accountResult] = await Promise.allSettled([
      listPosts(),
      readInstagramAnalytics(now),
    ])

    const posts = postsResult.status === 'fulfilled' ? postsResult.value : []
    const account: AccountAnalytics =
      accountResult.status === 'fulfilled' ? accountResult.value : { kind: 'unreadable' }

    if (posts.length === 0) return { ...empty, account }

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
