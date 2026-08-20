import { BreakdownCard } from '@/components/audience/breakdown'
import { InferredLine, InferredPanel } from '@/components/audience/inferred'
import { FollowerThreshold } from '@/components/audience/threshold'
import { FollowerTrend } from '@/components/audience/trend'

/**
 * The two layers of `/brain/audience`, side by side, so the difference is
 * arguable rather than asserted.
 *
 * ── WHY THIS IS ON THE DESIGN-SYSTEM PAGE ────────────────────────────────────
 * The distinction it demonstrates — MEASURED versus WORKED OUT — is the whole
 * reason the audience screen can ship at all, and it is invisible in production:
 * every workspace on this deployment sits under Instagram's 100-follower floor,
 * so the measured layer has never rendered with real figures. Putting both layers
 * here means the claim can be checked with the greyscale toggle above, on a page
 * that needs no account, rather than taken on trust.
 *
 * Every figure below is DEMONSTRATION DATA and is labelled as such in the section
 * blurb. It is Zernio's own published example payload, not a plausible-looking
 * invention — the strongest claim available about the populated shape without a
 * hundred-follower account to point at.
 */

const DEMO_AGE = [
  { label: '25-34', value: 4500 },
  { label: '18-24', value: 3200 },
  { label: '35-44', value: 1900 },
  { label: '45-54', value: 620 },
]

/** Ten days that actually move, so the trend and the gap are both visible. */
const DEMO_DAYS = [
  { day: '2026-08-09', followers: 41 },
  { day: '2026-08-10', followers: 44 },
  { day: '2026-08-11', followers: 46 },
  // 12th deliberately missing — a day nothing was collected. The line BREAKS
  // here rather than joining across, because joining would draw a measurement
  // that was never taken.
  { day: '2026-08-13', followers: 53 },
  { day: '2026-08-14', followers: 55 },
  { day: '2026-08-15', followers: 58 },
]

export function AudienceLayers() {
  return (
    <div className="grid gap-6">
      <div className="grid gap-3 narrow:grid-cols-2">
        <BreakdownCard dimension="age" buckets={DEMO_AGE} followers={5230} />
        <div className="surface-ring flex flex-col gap-3 rounded-card bg-surface p-4">
          <h3 className="type-h3 text-ink">Followers, day by day</h3>
          <FollowerTrend days={DEMO_DAYS} />
          <p className="type-sm text-muted">
            The 12th is missing on purpose. A day nothing was collected leaves a break in the
            line &mdash; it is not drawn as a zero and it is not joined across.
          </p>
        </div>
      </div>

      <FollowerThreshold followers={58} floor={100} />

      <InferredLine />

      <div className="grid gap-3 narrow:grid-cols-2">
        <InferredPanel
          title="How long until Instagram describes your audience"
          evidence="17 followers gained over 6 days"
        >
          <p>
            At the pace Sahoda has measured you would pass{' '}
            <span className="num">100</span> followers in about{' '}
            <span className="num">15</span> days. That is a straight-line guess from a short
            record, not a forecast.
          </p>
        </InferredPanel>
        <InferredPanel title="The same panel, refusing" evidence="4 days of follower counts">
          <p>
            Sahoda needs at least <span className="num">7</span> days of follower counts before
            it will estimate a pace. It has <span className="num">4</span>.
          </p>
        </InferredPanel>
      </div>
    </div>
  )
}
