import Link from 'next/link'

import { CardEmpty } from '@/components/empty-state'
import { Card, CardLabel } from '@/components/ui/card'
import { Unmeasured, Unreadable } from '@/components/design-system/absence-row'
import type { SpendRead } from '@/lib/home/spend'

import { SpendArea } from './spend-area'
import { SpendBars } from './spend-bars'

/**
 * Credits spent, last 30 days.
 *
 * ── THE CARD THAT SAID IT WAS EMPTY TWICE ────────────────────────────────────
 * MEASURED by docs/27 §1: this card rendered BOTH charts unconditionally, and
 * each one owned its own empty state. On a new workspace that produced
 *
 *     "No credits spent yet. Your first AI action will show up here."
 *     "Nothing spent yet — no actions to break down."
 *
 * one above the other, with ~280px of empty box between them. Two sentences,
 * one claim, and each individually well written — which is exactly how the
 * whole screen ended up reading as a product apologising for itself.
 *
 * The fix is structural, not editorial. Emptiness is decided ONCE, by the card,
 * because the card is the thing that is empty; a chart cannot know whether its
 * sibling is also empty. Both charts render, or neither does and one sentence
 * explains why.
 *
 * ── THE TOTAL IS A SLOT, NOT A ZERO ──────────────────────────────────────────
 * `spend.total` is 0 in BOTH the empty and the unreadable states, so printing
 * it would state "you spent 0 credits" on the strength of a read that threw.
 * docs/26 §4: those are different claims and they now render as different
 * marks.
 */
export function SpendCard({ spend }: { spend: SpendRead }) {
  const hasSeries = spend.status === 'ok' && spend.days.length > 0

  return (
    <Card className="space-y-4">
      <div className="flex items-baseline justify-between gap-3">
        <CardLabel>Credits spent · last 30 days</CardLabel>
        <span className="num text-[13px] font-semibold">
          {spend.status === 'ok' ? (
            spend.total.toLocaleString('en-IN')
          ) : spend.status === 'unreadable' ? (
            <Unreadable what="Credits spent in the last 30 days" />
          ) : (
            <Unmeasured what="Credits spent in the last 30 days" />
          )}
        </span>
      </div>

      {hasSeries ? (
        <>
          <SpendArea spend={spend} />
          <SpendBars spend={spend} />
        </>
      ) : (
        // ONE sentence. The two claims stay distinct — "we could not look" is
        // not "there is nothing to see" — but only one of them is ever on
        // screen, and neither is said twice.
        <CardEmpty
          body={
            spend.status === 'unreadable'
              ? 'Sahoda could not read your spending just now. Nothing has been charged, and reloading will try again.'
              : 'Nothing spent yet. Your first AI action shows up here, broken down by what it was for.'
          }
          action={
            spend.status === 'unreadable' ? null : (
              <Link
                href="/wallet"
                className="rounded-sm text-[12px] font-[550] text-accent transition-micro hover:underline"
              >
                See your credit activity
              </Link>
            )
          }
        />
      )}
    </Card>
  )
}
