import 'server-only'

import { readInstagramAnalytics, type AccountAnalytics } from '@/lib/analytics/account-insights'
import { listPosts, listVariantStates } from '@/lib/posts/read'

/**
 * The two facts the analytics page reads live: the account panel, and whether
 * anything has ever published.
 *
 * ── WHAT THIS USED TO READ, AND WHY IT STOPPED ───────────────────────────────
 * Until 2026-09-03 this module also built a comparison table: every published
 * channel of every post, each asked of Zernio live, up to 24 calls in six serial
 * rounds on every render. The page stopped rendering that table on 2026-08-29
 * (commit 6a4fda80, "rebuild the page as the evidence layer"): its rows and
 * channel cards now come from `readWindow`, which reads `post_metric_snapshots`
 * and touches Zernio not at all. The 24 calls kept going out, and their answers
 * were dropped on the floor. `hasPublished` was decided before the first of them.
 *
 * So the per-post half is gone from here. What remains is the one live read the
 * page still shows (the account panel, two calls, memoised for ten minutes in
 * `account-insights.ts`) and a database question with a yes-or-no answer.
 *
 * NEVER REJECTS: the analytics page is a read-only view and a hiccup in either
 * read must cost that section, not the page.
 */

export interface AnalyticsPageData {
  account: AccountAnalytics
  /**
   * True when at least one channel of at least one post has published.
   *
   * Decided from `post_variants` alone, not from metrics: a channel that
   * published and reported nothing has still published, and this flag is what
   * keeps a workspace with drafts apart from a workspace with nothing at all.
   */
  hasPublished: boolean
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

/** Has any channel of any of these posts published? A read failure answers no. */
async function anyPublished(postIds: readonly string[]): Promise<boolean> {
  if (postIds.length === 0) return false
  try {
    const variantStates = await listVariantStates([...postIds])
    for (const rows of variantStates.values()) {
      if (rows.some((row) => row.status === 'published')) return true
    }
    return false
  } catch (error) {
    console.error('[analytics] page read threw', error instanceof Error ? error.message : 'unknown')
    return false
  }
}

export async function readAnalyticsPage(now: Date = new Date()): Promise<AnalyticsPageData> {
  // Both are total, so both can be awaited together and neither can reject. The
  // account value is in scope for every return, whatever the post side did.
  const [account, posts] = await Promise.all([readAccount(now), listPosts().catch(() => [])])
  const hasPublished = await anyPublished(posts.map((post) => post.id))
  return { account, hasPublished }
}
