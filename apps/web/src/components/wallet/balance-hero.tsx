import { TriangleAlert } from 'lucide-react'

import { Card, CardLabel } from '@/components/ui/card'
import type { WalletBalance } from '@/lib/wallet/balance'

export interface BalanceHeroProps {
  balance: WalletBalance
  /**
   * Result of `staleHoldNote(openHolds, now)` — non-null only when credits are
   * stuck behind an action that outlived its hold. Derived on the server so this
   * component stays pure and does not read the clock during render.
   */
  staleNote: string | null
}

/** Explicit locale so grouping is identical in every render environment. */
const formatCredits = (value: number): string => value.toLocaleString('en-IN')

/**
 * The wallet hero.
 *
 * The big number is `available`, never `total`. `total` includes credits already
 * committed to in-flight actions, so showing it here would tell the user they can
 * spend credits that are already reserved.
 */
export function BalanceHero({ balance, staleNote }: BalanceHeroProps) {
  const isZero = balance.available === 0

  return (
    <Card data-guide="wallet.balance" className="space-y-3">
      <CardLabel>Available credits</CardLabel>

      {/* docs/08 §8: a credit change must be announced, not merely repainted. */}
      <p aria-live="polite" className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        {/* `type-hero-num` — THE token for this, and this is the case it was
            written for: "the ONE big number per view" (docs/26 §5). It was
            hand-written as `text-[44px] leading-[52px] font-extrabold`, which is
            the exact drift §5 exists to stop: a size band spelled out at a call
            site diverges from every other call site that spelled it out too. The
            token is 44/44 at weight 650 with −0.03em tracking, so this also
            picks up the optical tracking large type needs and loses 8px of
            leading it did not.

            `.num` is mono + tabular — the balance is one of the three places
            mono is allowed, and the total/held line below stays sans and only
            aligns its digits. `text-ink` is load-bearing: without it the figure
            inherits --ink-body from <body> and lands at the same weight as the
            label beside it.

            It does NOT count up. Authoritative live balance — docs/26 §8.1,
            enforced by count-up.guard.test.ts. */}
        <span className="type-hero-num num text-ink">{formatCredits(balance.available)}</span>
        <span className="text-muted">
          {balance.available === 1 ? 'credit to spend' : 'credits to spend'}
        </span>
      </p>

      <p className="text-[13px] text-muted">
        <span className="tabular-nums">{formatCredits(balance.total)}</span> total ·{' '}
        <span className="tabular-nums">{formatCredits(balance.held)}</span> held
      </p>

      {/* A zero balance is a real state, not an error — it gets plain copy, no banner. */}
      {isZero ? (
        <p className="text-[13px] text-muted">
          You have no credits to spend right now. Top up below to start an AI action.
        </p>
      ) : null}

      {/* Held credits are reserved, not spent. `heldNote` says so in words. */}
      {balance.hasHold && balance.heldNote !== null ? (
        <p className="text-[13px] text-muted">{balance.heldNote}</p>
      ) : null}

      {staleNote !== null ? (
        <p
          role="status"
          className="flex items-start gap-2 rounded-input bg-warn-bg px-3 py-2.5 text-[13px] text-warn"
        >
          <TriangleAlert size={15} strokeWidth={2} className="mt-0.5 shrink-0" aria-hidden />
          <span>{staleNote}</span>
        </p>
      ) : null}
    </Card>
  )
}
