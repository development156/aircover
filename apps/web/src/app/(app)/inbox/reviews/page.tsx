import { InboxShell } from '@/components/inbox/inbox-shell'
import { ReviewCard } from '@/components/inbox/review-card'
import { SurfaceList, SurfaceRow } from '@/components/inbox/surface-list'
import { ThreadPlaceholder } from '@/components/inbox/thread-placeholder'
import { readReviews } from '@/lib/inbox/read'

export const metadata = { title: 'Inbox · Reviews' }

/**
 * `GET /inbox/reviews`, read-only. Google Business Profile only.
 *
 * ── THIS SHIPS EMPTY, AND THE EMPTY STATE MATTERS ────────────────────────────
 * The endpoint answers `[LIVE 2026-08-10]` — envelope, `pagination`, `meta` and
 * a `summary: {totalReviews, averageRating}` we do not yet read. The
 * `ZernioReview` ROW shape is still `[DOC]`: not one review has been observed,
 * because no GBP account has ever connected. `accountsQueried: 0` on that live
 * response is the proof.
 *
 * It must NOT say "no reviews". That is a claim about the customer's shop, and
 * we have asked nobody — a business with forty reviews would open this page and
 * be told it has none. It says the reviews will appear once a Google Business
 * Profile is connected, which is a statement about Sahoda and is true.
 * `decideSurface` enforces the distinction; the copy lives in
 * `@/lib/inbox/emptiness`, which is also why none is written here.
 */
export default async function InboxReviewsPage() {
  const { rows, decision } = await readReviews()
  const reviews = decision.showList ? rows : []

  return (
    <InboxShell
      emptiness={decision.state}
      mobileShow={reviews.length > 0 ? 'list' : 'thread'}
      hasSomethingToOpen={reviews.length > 0}
      list={
        <SurfaceList
          title="Reviews"
          isEmpty={reviews.length === 0}
          emptyLine={
            decision.showList ? 'Nothing to show for the accounts we asked.' : 'Nothing read yet.'
          }
        >
          {reviews.map((review) => (
            <SurfaceRow key={`${review.accountId}:${review.id}`}>
              <ReviewCard review={review} />
            </SurfaceRow>
          ))}
        </SurfaceList>
      }
      thread={
        <ThreadPlaceholder
          emptiness={decision.state}
          hasConversations={reviews.length > 0}
          selectLine="Pick a review to read and reply to it."
        />
      }
    />
  )
}
