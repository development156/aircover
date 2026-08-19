import Link from 'next/link'

import { InertPanel, NotRunningNote } from '@/components/ads/inert-parts'
import { InertButton, InertChip } from '@/components/roadmap/inert'
import { DataTable } from '@/components/ui/data-table'

export const metadata = { title: 'Ad results' }

/**
 * ADS · RESULTS — the report, with its columns visible and its cells empty.
 *
 * ── WHY THERE IS NOT A SINGLE NUMBER ON THIS SCREEN ─────────────────────────
 * This is the screen where a roadmap page is most tempted to cheat. A dashboard
 * with plausible figures is the easiest thing to draw and the most convincing
 * thing to show a founder, and every figure on it would be a claim about the
 * reader's own business with nothing behind it — no ad account, no impression,
 * no click, no rupee. That is the one class of thing this product may never
 * invent, and a results screen is exactly where inventing it would do the most
 * damage, because results are what people make the next decision from.
 *
 * So: the columns are named, the tiles are named, and every value is absent.
 * Not zeroed, not dashed. `DataTable` keeps its headers on screen when it has no
 * rows precisely so a reader can see what would be there.
 *
 * ── THE COMPARISON IS THE FEATURE ────────────────────────────────────────────
 * Paid numbers on their own are a platform's own dashboard, which the customer
 * already has. What Sahoda can do that Meta Ads Manager cannot is put the paid
 * week next to the unpaid one — the posts, per channel, that ran alongside it.
 * `/analytics` already reports the unpaid half from real rows today, so that is
 * a real link and not a promise.
 */
export default function AdsPerformancePage() {
  return (
    <div className="space-y-grid">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="type-h2">Results</h2>
          <p className="type-body mt-1 max-w-[68ch] text-muted">
            What the spend bought, next to what your unpaid posts did in the same week.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {/* "Last 7 days" was here and it carried a digit, which the Ads guard
              refuses on any picture-of-a-control. The guard was right for a
              second reason: a seven-day window implies seven days of something,
              and there is nothing behind this screen to have a window OF. */}
          <InertChip on>This week</InertChip>
          <InertChip>This month</InertChip>
          <InertButton>Export</InertButton>
        </div>
      </div>

      <InertPanel
        title="The headline numbers"
        what="Four figures, each from the platform that served the ad. None of them exists yet, so none of them is drawn."
      >
        <div className="grid grid-cols-4 gap-3 max-wide:grid-cols-2 max-narrow:grid-cols-1">
          {['People reached', 'Clicks', 'Results', 'Cost per result'].map((label) => (
            <div key={label} className="is-proposed flex flex-col gap-1 rounded-card p-3">
              <span className="type-eyebrow text-muted">{label}</span>
              {/* No figure, no dash, no zero, and no skeleton bar either — a
                  skeleton says a value is loading, and nothing is loading. The
                  tile is a labelled empty box, which is the true statement. */}
              <span className="type-sm text-muted">Comes from the platform</span>
            </div>
          ))}
        </div>
      </InertPanel>

      <section aria-labelledby="ads-per-ad" className="flex flex-col gap-2">
        <h3 id="ads-per-ad" className="type-h3">
          Every ad, one row
        </h3>
        <DataTable
          caption="Ad results, one row per ad and placement"
          columns={[
            { key: 'ad', header: 'Ad' },
            { key: 'placement', header: 'Placement' },
            { key: 'audience', header: 'Audience' },
            { key: 'spend', header: 'Spend', numeric: true },
            { key: 'reached', header: 'Reached', numeric: true },
            { key: 'results', header: 'Results', numeric: true },
          ]}
          rows={[]}
          empty="No results — no ad has run. These are the columns Sahoda will report, and each one will name the platform it came from."
        />
      </section>

      <section className="surface-ring flex flex-col gap-1 rounded-card bg-surface p-4">
        <h3 className="type-h3">The half of this that already works</h3>
        <p className="type-body max-w-[68ch] text-muted">
          Sahoda reports on your unpaid posts today, per channel, from what the platforms actually
          returned. That is the column this screen will sit beside — and it is the reason paid
          results here will be worth more than the same numbers in Meta&rsquo;s own dashboard.
        </p>
        <p className="mt-2">
          <Link href="/analytics" className="type-body font-[550] text-accent hover:underline">
            Open Analytics
          </Link>
        </p>
      </section>

      <NotRunningNote>
        Nothing on this screen is measured, estimated or modelled. When an ad runs, every figure
        will name the platform it came from, and a figure a platform did not return will be shown as
        missing rather than filled in.
      </NotRunningNote>
    </div>
  )
}
