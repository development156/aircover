import type { ZernioReview } from '@sahoda/publishing'
import { Star } from 'lucide-react'

import { cn } from '@/lib/utils'

import { platformLabel } from './platform-label'

const WHEN = new Intl.DateTimeFormat('en-IN', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  timeZone: 'Asia/Kolkata',
})

function formatWhen(value: string | undefined): string | null {
  if (!value) return null
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : WHEN.format(parsed)
}

/**
 * A star rating.
 *
 * The numeral carries the value for assistive tech and the stars are `aria-hidden` —
 * five separate "star" announcements say nothing a screen reader user wants to hear.
 * Ratings are clamped to 0–5 so a malformed payload cannot render a 40-star row.
 */
function Rating({ rating }: { rating: number }) {
  const safe = Number.isFinite(rating) ? Math.max(0, Math.min(5, Math.round(rating))) : 0

  return (
    <span className="inline-flex items-center gap-1" aria-label={`${safe} out of 5`}>
      <span aria-hidden className="inline-flex">
        {[1, 2, 3, 4, 5].map((n) => (
          <Star
            key={n}
            size={14}
            strokeWidth={2}
            className={cn(n <= safe ? 'fill-warn text-warn' : 'text-line')}
          />
        ))}
      </span>
      <span className="text-[13px] font-semibold text-muted tabular-nums">{safe}</span>
    </span>
  )
}

/**
 * One review.
 *
 * `hasReply` comes back WITH the data, so the "replied" state is read rather than
 * inferred — and there is no reply button here, because replying is a write and this
 * surface is read-only. An affordance that does nothing is worse than none.
 */
export function ReviewCard({ review }: { review: ZernioReview }) {
  const when = formatWhen(review.created)

  return (
    <article className="rounded-card border border-line bg-bg px-4 py-3 shadow-card">
      <div className="flex flex-wrap items-center gap-2">
        <Rating rating={review.rating} />
        <span className="text-[15px] font-bold">{review.reviewer?.name ?? 'Anonymous'}</span>
        <span className="rounded-pill bg-s2 px-2 py-[2px] text-[12px] leading-[18px] font-semibold text-muted">
          {platformLabel(review.platform)}
        </span>
        {review.hasReply ? (
          <span className="rounded-pill bg-ok-bg px-2 py-[2px] text-[12px] leading-[18px] font-semibold text-ok">
            Replied
          </span>
        ) : null}
        {when ? <span className="text-[13px] text-muted tabular-nums">{when}</span> : null}
      </div>

      {review.locationName ? (
        <p className="mt-0.5 text-[12px] text-muted">{review.locationName}</p>
      ) : null}

      {review.text ? (
        <p className="mt-2 max-w-[70ch] text-[14px] leading-[22px]">{review.text}</p>
      ) : (
        <p className="mt-2 text-[14px] text-muted italic">Rating only — no written review.</p>
      )}

      {review.reply?.text ? (
        <div className="mt-3 border-l-2 border-line pl-3">
          <p className="text-[12px] font-semibold text-muted">Your reply</p>
          <p className="mt-0.5 max-w-[70ch] text-[14px] leading-[22px] text-muted">
            {review.reply.text}
          </p>
        </div>
      ) : null}
    </article>
  )
}
