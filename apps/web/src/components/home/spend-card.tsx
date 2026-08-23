import Link from 'next/link'

import { CardEmpty } from '@/components/empty-state'
import { CountUp } from '@/components/motion/count-up'
import { Card, CardLabel } from '@/components/ui/card'
import { Unreadable } from '@/components/design-system/absence-row'
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
 * ── THE TOTAL: A REAL ZERO IS KNOWLEDGE, AN UNREADABLE ONE IS NOT ────────────
 * `spend.total` is 0 in BOTH the `empty` and the `unreadable` states, and the
 * card used to print it for both — so a read that THREW rendered "0", stating
 * that you spent nothing on the strength of a query that failed.
 *
 * Only `unreadable` is an absence. `empty` is `rows.length === 0` after a
 * SUCCESSFUL read (`lib/home/spend.ts:118`), which means the true answer is
 * zero and we know it. Rendering the Unmeasured mark there would claim we never
 * looked, which is the honesty rule running backwards — and it is exactly what
 * the first version of this card did. Caught by reading the rendered frame, not
 * the code: `design-audit-after/light-1440/home.png` showed an absence mark
 * beside "CREDITS SPENT · LAST 30 DAYS" on a workspace whose spend had been
 * read successfully.
 *
 * The rule is the one CreditChip already states: a real zero renders as 0 —
 * that is knowledge.
 */
/**
 * The single category's own label, lower-cased to sit inside a sentence.
 *
 * `SpendRead` is an interface with a `status` string rather than a discriminated
 * union, so `Extract<…, { status: 'ok' }>` narrows to `never` — it takes the
 * whole read and reads `byAction`, which is present on every status.
 */
function oneLabel(spend: SpendRead): string {
  const label = spend.byAction[0]?.label ?? 'one action'
  return label.charAt(0).toLowerCase() + label.slice(1)
}

export function SpendCard({ spend }: { spend: SpendRead }) {
  const hasSeries = spend.status === 'ok' && spend.days.length > 0

  return (
    <Card className="space-y-4">
      <div className="flex items-baseline justify-between gap-3">
        <CardLabel>Credits spent · last 30 days</CardLabel>
        <span className="num type-sm font-semibold">
          {spend.status === 'unreadable' ? (
            <Unreadable what="Credits spent in the last 30 days" />
          ) : (
            // `ok` AND `empty` — both are successful reads, so both have a real
            // number. Settled and historical: a closed 30-day window that will
            // not move while you look at it (docs/26 §8.1). NOT the balance,
            // which is the live figure you act on, sits in the rail beside this
            // card, and does not count.
            <CountUp value={spend.total} />
          )}
        </span>
      </div>

      {hasSeries ? (
        <>
          <SpendArea spend={spend} />
          {/* ── A TOTAL AND ITS ONLY CATEGORY ARE THE SAME NUMBER ───────────
              With one category the breakdown restates the figure already
              printed in the header — "CREDITS SPENT · LAST 30 DAYS  30" above
              "DRAFT POST  30", the same 30 twice, 170px apart. It only became
              visible once the always-100% bar was removed; the bar had been
              carrying the eye past the repetition. So the single category is
              NAMED rather than tabulated, which says the extra thing the header
              could not (what the spend was for) without saying the number
              again. Two or more, and there is a real breakdown to draw. */}
          {spend.status === 'ok' && spend.byAction.length === 1 ? (
            <p className="type-meta text-muted">All of it on {oneLabel(spend)}.</p>
          ) : (
            <SpendBars spend={spend} />
          )}
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
                className="rounded-sm type-meta font-[550] text-accent transition-micro hover:underline"
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
