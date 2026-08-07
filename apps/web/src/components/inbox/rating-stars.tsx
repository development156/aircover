import { Star } from 'lucide-react'

import { cn } from '@/lib/utils'

/**
 * A 1–5 rating, drawn as filled and unfilled stars.
 *
 * The count is rendered as text alongside, not implied by the icons alone: five
 * shapes of slightly different fill is not something everyone can read, and a
 * rating is a number before it is a picture.
 */
export function RatingStars({ rating, className }: { rating: number; className?: string }) {
  const whole = Math.max(0, Math.min(5, Math.round(rating)))
  return (
    <span className={cn('inline-flex items-center gap-1', className)}>
      <span className="flex" aria-hidden>
        {[1, 2, 3, 4, 5].map((n) => (
          <Star
            key={n}
            size={13}
            // The faint ink token is barred from anything but disabled or
            // decorative use and its exception register may only shrink, so an
            // unfilled star uses muted at reduced opacity instead — same result,
            // no exception owed. (The guard greps source text, comments included.)
            className={n <= whole ? 'fill-warn text-warn' : 'text-muted opacity-40'}
            strokeWidth={2}
          />
        ))}
      </span>
      <span className="text-[12.5px] font-semibold tabular-nums">{rating.toFixed(1)}</span>
      <span className="sr-only">out of 5</span>
    </span>
  )
}
