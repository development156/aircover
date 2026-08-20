import { InertPanel, NotRunningNote } from '@/components/roadmap/parts'
import { InertButton, InertChip, InertField } from '@/components/roadmap/inert'
import { DataTable } from '@/components/ui/data-table'

export const metadata = { title: 'Ad budget' }

/**
 * ADS · BUDGET — the screen that is not allowed to be easy.
 *
 * ── WHY THIS IS THE LAST THING THAT WILL SHIP, NOT THE FIRST ────────────────
 * A budget looks like the simplest field on this page: a box, a number, done.
 * It is the hardest thing in the section, and the reason is that money is the
 * one place a mistake is not recoverable by re-running something.
 *
 * A real budget needs a spend record that cannot be edited after the fact, a
 * running total that stays correct when two things spend at the same moment, and
 * an answer for a charge a platform reports three days late — which they do.
 * This codebase already has exactly one system built to that standard, the
 * credit ledger, and it is as careful as it is for this reason.
 *
 * So the `campaigns` table shipped with NO budget column, deliberately: a column
 * holding a budget with nothing enforcing or spending against it is a number on
 * a screen that means nothing, and that is worse than an empty space because it
 * looks like a working feature.
 *
 * ── WHICH IS WHY THIS SCREEN SHOWS A LEDGER AND NOT A GAUGE ─────────────────
 * The obvious design is a spend-against-budget bar. A bar encodes a ratio, both
 * halves of that ratio are absent, and an empty track reads as "you have spent
 * nothing of a real budget" rather than as "there is no budget". The table
 * below is the honest shape of the same feature: every rupee as a row, which is
 * what the credit ledger already does and what a customer can actually check.
 */
export default function AdsBudgetPage() {
  return (
    <div className="space-y-grid">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="type-h2">Budget</h2>
          <p className="type-body mt-1 max-w-[68ch] text-muted">
            What you are willing to spend, how fast it goes out, and a record of every rupee that
            moved.
          </p>
        </div>
        <InertButton primary>Set budget</InertButton>
      </div>

      <InertPanel title="What you will spend" what="A ceiling and a pace. Both are yours to set.">
        <div className="grid gap-3 narrow:grid-cols-2">
          <div className="flex flex-col gap-2">
            <span className="type-eyebrow text-muted">Amount</span>
            <InertField label="The most this campaign may ever spend" />
          </div>
          <div className="flex flex-col gap-2">
            <span className="type-eyebrow text-muted">Pace</span>
            <div className="flex flex-wrap gap-1.5">
              <InertChip on>Even, every day</InertChip>
              <InertChip>Fast, then stop</InertChip>
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <span className="type-eyebrow text-muted">Starts</span>
            <InertField label="The first day it may spend" />
          </div>
          <div className="flex flex-col gap-2">
            <span className="type-eyebrow text-muted">Ends</span>
            <InertField label="The last day it may spend" />
          </div>
        </div>
      </InertPanel>

      {/* The spend record, shown as columns with no rows. No bar, no ratio, no
          "0 of ₹0" — see the header. */}
      <section aria-labelledby="ads-spend" className="flex flex-col gap-2">
        <h3 id="ads-spend" className="type-h3">
          Every rupee, as a row
        </h3>
        <p className="type-body max-w-[68ch] text-muted">
          Not a progress bar. A charge you can point at, with the day it happened and the ad it
          belongs to — the same way your credit history already works, and for the same reason.
        </p>
        <DataTable
          caption="Ad spend, one row per charge"
          columns={[
            { key: 'when', header: 'When' },
            { key: 'campaign', header: 'Ad campaign' },
            { key: 'placement', header: 'Where' },
            { key: 'amount', header: 'Amount', numeric: true },
            { key: 'running', header: 'Running total', numeric: true },
          ]}
          rows={[]}
          empty="No spend — Sahoda cannot spend on your behalf yet. These are the columns it will record."
        />
      </section>

      <NotRunningNote>
        Nothing here charges anything, and nothing here touches your credits. Credits pay for what
        Sahoda writes and generates; ad spend goes to Meta or Google from your own ad account, and
        the two never come out of the same balance.
      </NotRunningNote>
    </div>
  )
}
