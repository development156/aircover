import { ChevronDown } from 'lucide-react'
import { X_API_PRICE_USD, X_MONTHLY_RATION } from '@sahoda/publishing'

import { Unreadable } from '@/components/design-system/absence-row'

/**
 * WHAT AN X POST COSTS, SAID BEFORE THE BUTTON THAT STARTS THE FLOW.
 *
 * X is the only channel in the catalogue that bills per post. Everything else
 * costs Sahoda a flat per-account fee, so "one more post" is free at the margin;
 * on X it is $0.015, and **$0.200 when the post carries a link** — 13.3× — which
 * is very nearly every marketing post an SMB writes.
 *
 * ── WHAT THIS DELIBERATELY DOES NOT CLAIM ────────────────────────────────────
 * It is not X's allowance. X has no monthly write allowance left to count against:
 * as of February 2026 the API is pay-per-use and the Free/Basic/Pro tiers are
 * closed to new developers (https://docs.x.com/x-api/introduction). Rendering
 * "247 of 500 left" would invent a denominator, which is the `100 of —` failure
 * `docs/26_Design_System_v4.md` §4 names — a numerator, the word "of", and a
 * quantity that does not exist.
 *
 * So the denominator is stated as SAHODA's, in words, on the line under the
 * number. The numerator is measured: live `post_publish_logs` rows, never
 * `publish_status`, which currently holds three fixture runs for X that never
 * reached the platform.
 *
 * ── AND IT DOES NOT ANIMATE ──────────────────────────────────────────────────
 * "A number changing" is on §8's must-never-animate list. `.num` gives it tabular
 * figures for the same reason: a count whose digits shuffle reads as unstable.
 */

export type XRationMeterProps =
  { status: 'ok'; used: number; remaining: number } | { status: 'unreadable' }

/** `$0.015` / `$0.20` — never rounded to a figure X does not publish. */
function usd(amount: number): string {
  return `$${amount.toFixed(amount < 0.1 ? 3 : 2)}`
}

export function XRationMeter(props: XRationMeterProps) {
  if (props.status === 'unreadable') {
    return (
      <div className="mt-3 rounded-input bg-s2 px-3 py-2">
        <p className="type-eyebrow text-muted">X posts this month</p>
        <p className="type-sm mt-1 flex items-center gap-2 text-muted">
          {/* NOT "0 of 12". A failed read is not a reading of zero — that would
              tell a customer they have spent nothing when the truth is we could
              not find out, and it is the permissive direction, which a spending
              cap must never be wrong in. */}
          <Unreadable what="Your X post count" />
          <span>Couldn&rsquo;t read your X count just now &mdash; reload to see it.</span>
        </p>
      </div>
    )
  }

  const { used, remaining } = props
  const exhausted = remaining === 0

  /**
   * ── THE COUNT LEADS; THE PRICING IS ONE CLICK AWAY ───────────────────────
   * This block used to be the heaviest object on the X tile — a filled well
   * carrying a `type-h3` figure and a two-clause sentence about per-post API
   * pricing, on a card whose job is "connect this channel". The founder's note
   * on it is exact: billing detail should not hold the primary visual
   * hierarchy.
   *
   * So the SENTENCE moves into a disclosure and the COUNT stays visible. What
   * does NOT change is the claim, and the summary is written so it cannot be
   * read as X's allowance: "of Sahoda's 12" says whose limit it is on the one
   * line everybody sees. Dropping "Sahoda's" and printing "12 posts remaining
   * this month" would be the vaguer-than-the-truth failure — X has no monthly
   * write allowance to remain against, which is the whole reason this component
   * refuses a "247 of 500" shape in the first place.
   *
   * `<details>` rather than state: it is keyboard-reachable, it needs no
   * client component on a server-rendered tile, and it cannot desynchronise
   * from anything.
   */
  return (
    <details className="group mt-3 rounded-input bg-s2 px-3 py-2">
      <summary className="type-sm flex cursor-pointer list-none items-center gap-1.5 text-muted marker:content-none max-narrow:min-h-[44px]">
        <span className="min-w-0 flex-1">
          <span className="num font-semibold text-ink">
            {used} of {X_MONTHLY_RATION}
          </span>{' '}
          X posts this month, from Sahoda&rsquo;s ration
        </span>
        <ChevronDown
          aria-hidden
          className="size-3.5 shrink-0 transition-micro group-open:rotate-180"
        />
      </summary>
      <p className="type-sm mt-2 text-muted">
        {exhausted
          ? 'None left this month. Sahoda holds the rest until the month turns rather than spending on them.'
          : `${remaining} left. X bills Sahoda ${usd(X_API_PRICE_USD.createPost)} a post, and ${usd(X_API_PRICE_USD.createPostWithLink)} when it carries a link, so this allowance is ours rather than X\u2019s.`}
      </p>
    </details>
  )
}
