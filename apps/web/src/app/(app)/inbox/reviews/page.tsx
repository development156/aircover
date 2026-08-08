import { ReviewCard } from '@/components/inbox/review-card'
import { SurfaceBanner, SurfaceNotice } from '@/components/inbox/surface-notice'
import { readReviews } from '@/lib/inbox/read'

export const metadata = { title: 'Inbox · Reviews' }

/**
 * `GET /inbox/reviews`, read-only. Google Business Profile only.
 *
 * ── THIS SHIPS EMPTY, AND THE EMPTY STATE MATTERS ────────────────────────────
 * Reviews are `[DOC]`-tier: stated in Zernio's docs, never observed live, because no
 * GBP account has ever connected — `accountsQueried: 0` is the proof. So the surface
 * exists and has nothing to show, and the sentence it shows instead is load-bearing.
 *
 * It must NOT say "no reviews". That is a claim about the customer's shop, and we have
 * asked nobody, so we have no basis for it — a business with forty reviews would open
 * this page and be told it has none. It says the reviews will appear once a Google
 * Business Profile is connected, which is a statement about Sahoda and is true.
 * `decideSurface` enforces the distinction; the copy lives in `@/lib/inbox/emptiness`.
 */
export default async function InboxReviewsPage() {
  const { rows, decision } = await readReviews()

  if (!decision.showList) {
    return <SurfaceNotice state={decision.state} />
  }

  return (
    <div className="space-y-grid">
      <SurfaceBanner state={decision.state} />
      <ul className="space-y-2" data-guide="inbox.reviews">
        {rows.map((review) => (
          <li key={`${review.accountId}:${review.id}`}>
            <ReviewCard review={review} />
          </li>
        ))}
      </ul>
    </div>
  )
}
