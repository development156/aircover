import { PageTitle } from '@/components/page-title'
import { PerformanceStrip } from '@/components/analytics/performance-strip'
import { BestPerforming } from '@/components/analytics/best-performing'
import { PerformanceOverTime } from '@/components/analytics/performance-over-time'
import { AccountPanel } from '@/components/analytics/account-panel'
import { ChannelTable } from '@/components/analytics/channel-table'
import { PostTable } from '@/components/analytics/post-table'
import { ReadinessLine } from '@/components/analytics/readiness-line'
import { WhatPublished } from '@/components/analytics/what-published'
import { coverageFor } from '@/lib/analytics/compare'
import { ANALYTICS_METRIC_CALLS, readAnalyticsPage } from '@/lib/analytics/page-data'
import { analyticsReadiness } from '@/lib/analytics/readiness'
import { readMetricSeries } from '@/lib/analytics/series'

export const metadata = { title: 'Analytics' }

/**
 * Analytics — per-post performance, per-account insights, and the comparison.
 *
 * ── WHAT THIS PAGE IS ALLOWED TO SAY ─────────────────────────────────────────
 * Every rule the post cards already followed, and one more that only appears once
 * numbers are put next to each other. The card rules: a zero is never rendered for a
 * measurement that did not happen; `lastUpdated` is a POLL stamp and proves a sync
 * ran, not that anything was measured; a payload of zeroes inside a platform's
 * reporting window is pending, not measured; and a channel whose window we do not
 * know can never earn a zero at all.
 *
 * The new one: an ABSENT number must not become a zero by being aggregated or
 * ordered. A total that skipped two pending posts is a subtotal wearing a total's
 * clothes, and a pending post sorted to the bottom of a ranking has been called the
 * worst performer without a zero ever being drawn. `lib/analytics/compare.ts` owns
 * that refusal; this page only renders its verdicts.
 *
 * Three independent sections. The account read and the post read fail separately, so
 * a broken Instagram connection costs the account card and nothing else.
 */
export default async function AnalyticsPage() {
  /**
   * A FOURTH independent read, for the same reason the other three are independent:
   * the history lives in its own table and, until the founder applies migration
   * 20260819000100, that table does not exist. A read that cannot happen must cost
   * this one card and nothing else on the page.
   *
   * ── AND BECAUSE IT IS INDEPENDENT, IT IS NOT AWAITED SECOND ────────────────
   * The note above already said this read depends on nothing, and the code then
   * waited for `readAnalyticsPage()` to come back before starting it — one extra
   * round trip to ap-south-1 for a page that had already stated it did not need
   * one. MEASURED 2026-08-23: a PostgREST call from this server has a p50 of
   * 105ms, so that is roughly a tenth of a second on every visit to /analytics.
   */
  const [{ rows, posts, account, hasPublished }, series] = await Promise.all([
    readAnalyticsPage(),
    readMetricSeries('reach'),
  ])

  /**
   * ── SIX APOLOGIES, OR ONE ANSWER ─────────────────────────────────────────
   *
   * The note this replaces described five containers each arguing correctly for
   * its own existence and never against its four neighbours, and it fixed them
   * with a gate: `not-connected && !hasPublished && posts.length === 0`.
   *
   * THE GATE WAS AIMED ONE STATE TOO EARLY. `posts.length === 0` was added
   * because a two-part gate turned `analytics-history.spec.ts` red, and the note
   * argued that the state MEASURED as broken was "a workspace with NOTHING".
   * MEASURED again on 2026-08-23 one step along — four posts, two channels
   * published, nothing connected, which is where a beta account sits after its
   * first hour — the screen says "nothing" SIX times in six treatments across
   * 1237px at 1440 and 1652px at 390, and renders no number at all. The gate
   * closed the state nobody stays in and left open the state everybody does.
   *
   * ── AND THE GATE IS STILL NOT WIDENED ────────────────────────────────────
   * Widening it is the obvious repair and it is the wrong one twice over.
   * `analytics-history.spec.ts` asserts the performance-over-time card is
   * present and says "has started keeping a history" on exactly that workspace;
   * widening the gate would delete the card and turn the spec red, and a guard
   * is never loosened to accommodate the change that broke it. It would also be
   * wrong on its own terms — a reader who cannot see that this product measures
   * reach AT ALL is worse off than one looking at an empty reach slot
   * (docs/37 §15: a container is structure).
   *
   * So the containers stay and the DIAGNOSIS moves. `analyticsReadiness` decides
   * the cause once, from the page's own data; `ReadinessLine` states it once, at
   * the top, with the one remedy attached; and every section below falls back to
   * its slot-level absence mark instead of re-deriving the same sentence.
   * Six statements become one, the card the spec depends on keeps its words, and
   * the gate is untouched.
   */
  const readiness = analyticsReadiness({
    account,
    hasPublished,
    // Impressions is the column the tables order on, so it is the one whose
    // presence decides whether this page has anything to show.
    measuredRows: coverageFor(rows, 'impressions').counted,
  })
  const reasonStated = readiness.kind !== 'measuring'

  /**
   * Nothing to structure. No posts, no publish, no account — so every container
   * below would be an empty frame around the one sentence the line already says,
   * and the line says it alone.
   *
   * This is the SAME component and the same words as the populated case, which
   * is the point: docs/27 §1's finding was six treatments of one fact, and
   * keeping a separate page-level `EmptyState` here would have left two. It also
   * retires the `Sahoda: Sahoda:` duplication that shipped in that block's `tip`
   * — `EmptyState` prefixes the string, and the caller passed one already
   * carrying the prefix.
   */
  const nothingToStructure = account.kind === 'not-connected' && !hasPublished && posts.length === 0

  return (
    <div className="space-y-grid">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <PageTitle>Analytics</PageTitle>
        {/* ── THE CORNER STRING IS GONE ────────────────────────────────────
            It read "2 published posts · 2 channels" in 12px muted type. Both
            figures now lead the page as stat cards at `type-hero-num`, and
            docs/37 §16 is explicit: a page that says the same thing in more
            than one place says it once, at the top. Keeping it would have been
            the same figure in the two most different sizes on the screen. */}
      </div>

      {/* The reference opens this page with a KPI strip (1150x103) and the app
          had none in ANY state. It is NOT gated on `hasPublished`, and that is
          the point: these are ACCOUNT insights — reach, views, accounts engaged,
          interactions — which Instagram reports for the account itself and which
          do not require this workspace to have published anything. Hiding them
          behind a post count would withhold numbers that already exist.

          The tables below stay gated, because those genuinely are per-post rows
          and there is nothing to tabulate until a post goes out. */}
      <ReadinessLine readiness={readiness} />

      {nothingToStructure ? null : (
        <>
          {/* ── THREE NUMBERS THIS PAGE CAN ALWAYS PROVE ─────────────────
              MEASURED before this landed: a workspace with two posts on two
              channels saw six containers and NOT ONE NUMBER, while the two real
              figures it held rendered as a 12px muted string in the page's
              top-right corner. Every container below waits on a platform; these
              three are counts of rows this product owns, so they are full the
              moment anything publishes. See the component. */}
          {hasPublished ? <WhatPublished posts={posts} rows={rows} /> : null}

          <PerformanceStrip analytics={account} reasonStated={reasonStated} detailsLink={false} />

          <AccountPanel analytics={account} reasonStated={reasonStated} />

          {/* The reference's two remaining containers, side by side beneath the
          account panel. Best performing is WIRED — rankBy already refuses to rank
          an unmeasured row. Performance over time is wired too now, and draws
          nothing until there is a history to draw: before the migration it renders
          the same container it always did. See the component for the five things
          it refuses to plot. */}
          <div className="grid grid-cols-[minmax(0,1fr)_340px] items-start gap-grid max-wide:grid-cols-1">
            <PerformanceOverTime series={series} />
            <BestPerforming rows={rows} reasonStated={reasonStated} />
          </div>

          {/* The tables are the one place a NUMBER can appear, so they are the
              last thing gated and the first thing that would be wrong to hide.
              Nothing to tabulate until a post goes out. */}
          {hasPublished ? (
            <>
              <ChannelTable rows={rows} />
              <PostTable rows={rows} />
              {/* The cap is STATED, not silently applied. Rows past it come back
                  `not-loaded`, and they are already counted in every denominator
                  on this page — but a reader who sees "18 of 30 reported"
                  deserves to know that some of the twelve were never asked
                  rather than assuming all twelve are still pending. */}
              {rows.length > ANALYTICS_METRIC_CALLS ? (
                <p className="type-meta text-muted">
                  Metrics are read for the first {ANALYTICS_METRIC_CALLS} published channels on this
                  page. The rest are listed as not loaded — open a post to read its own.
                </p>
              ) : null}
            </>
          ) : null}
          {/* ── WHERE THE SEVENTH STATEMENT USED TO BE ─────────────────────
              A page-level `EmptyState` — 44px orange marker tile, bold heading,
              centred prose, `Create post` — rendered here whenever nothing had
              published. docs/27 §1 called it the hierarchy inversion, and the
              2026-08-20 pass fixed the half of that which was fixable in place
              by giving it an action, so that loudest and most useful were the
              same object.

              It is gone rather than restyled, because on the frames docs/40 §3.1
              measured it was not the only thing saying this: `ReadinessLine` now
              opens the page with "Nothing published yet" and the same remedy,
              and a second copy 1100px lower is the repetition this whole lane is
              about. The claim did not move. The second rendering of it did. */}
        </>
      )}
    </div>
  )
}
