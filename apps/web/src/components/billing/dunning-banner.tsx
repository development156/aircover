import Link from 'next/link'
import type { DunningPolicy, PlanId } from '@sahoda/shared'

import { buttonVariants } from '@/components/ui/button'
import { dunningNotice } from '@/lib/billing/plan-copy'
import { cn } from '@/lib/utils'

/**
 * What a failed payment looks like, without a red.
 *
 * ── SEVERITY WITHOUT HUE ─────────────────────────────────────────────────────
 * There is no red in this palette and there is not going to be one (docs/26 §1.6). Severity
 * is carried by three things that all survive greyscale:
 *
 *   · FILL WEIGHT — the Certainty rung. `.is-committed` (tint + hairline) for "this will
 *     happen unless you act"; `.is-real` (solid, no edge) for "this has happened". A
 *     suspended account is not a warning about the future, it is a description of the
 *     present, so it moves UP the ladder rather than changing colour.
 *   · A GLYPH — `!` and `!!`, which a photocopy still shows.
 *   · THE WORDS — which say what stopped and what did not.
 *
 * Remove any one of the three and the other two still carry it. That is the test.
 *
 * ── THE SENTENCE THIS COMPONENT EXISTS TO DELIVER ────────────────────────────
 * "The credits you already have are yours to spend either way." Credits were paid for; a
 * lapsed subscription does not take them back, and the ledger could not do so honestly even
 * if we wanted it to. `plan-copy.test.ts` asserts that claim appears at every stage that
 * renders, because it is the promise the whole feature is built on.
 */
export function DunningBanner({ policy, planId }: { policy: DunningPolicy; planId: PlanId }) {
  const notice = dunningNotice(policy, planId)
  // A banner saying "your payments are fine" is furniture on every screen it appears on.
  if (!notice) return null

  return (
    <div
      role="alert"
      data-guide="plan.dunning"
      className={cn('rounded-card px-4 py-3', notice.rung)}
    >
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-2">
            {/*
              The glyph is a real character in the accessible name, not an icon with a
              `aria-hidden`. A screen reader should hear the severity, not just see it.
            */}
            <span aria-hidden className="type-h3 font-[650] tabular-nums">
              {notice.mark}
            </span>
            <span className="type-h3">{notice.title}</span>
          </p>
          <p className="type-body mt-1.5 text-ink">{notice.body}</p>
        </div>
        {/*
          The one action, and it goes to the wallet where a payment can actually be made.
          A destructive or dead-end control here would be worse than no banner.
        */}
        <Link href="/wallet" className={cn(buttonVariants({ variant: 'secondary', size: 'sm' }))}>
          {notice.action}
        </Link>
      </div>
    </div>
  )
}
