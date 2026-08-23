import { StatCard, StatStrip } from '@/components/charts/stat-card'
import { coverageFor, type ComparableRow } from '@/lib/analytics/compare'

/**
 * WHAT THIS PAGE CAN ALWAYS PROVE.
 *
 * ── THE SCREEN A CUSTOMER OPENS TO FIND OUT IF THE PRODUCT WORKS ─────────────
 * MEASURED on `page-dash-before__populated__analytics__full__1440__light`: a
 * workspace with two posts published to two channels sees a readiness line, six
 * containers, and NOT ONE NUMBER. The two real figures it holds — two published
 * posts, two channels — render as a 12px muted string in the top-right corner
 * of the page, smaller than any of the five apologies below it.
 *
 * Every one of those six containers is waiting on a PLATFORM. This strip is not:
 *
 *   Published    rows in `post_variants` with a live publish behind them
 *   Channels     distinct channels those rows went to
 *   Reporting    how many of those channels have returned a number
 *
 * Three counts of rows this product owns. They are full the moment anything
 * publishes, which is exactly the state the six apologies describe, and they
 * answer the question the screen exists for — did it go out — separately from
 * the one it cannot answer yet — how did it do.
 *
 * ── `Reporting` IS THE COVERAGE, PROMOTED ────────────────────────────────────
 * "0 of 2 channels reported." already appeared on this page twice, 130px apart,
 * in two different nouns, below two tables (docs/40 §3.1, items 5 and 6). It is
 * the single most important fact on an unmeasured Analytics screen — it says
 * whether the silence is Sahoda's fault or the platform's clock — and it was
 * a footnote. It leads now, in the same units as its neighbours.
 *
 * A zero here is KNOWLEDGE, not an absence: we asked every channel and none has
 * answered yet. That is why it renders "0" and not the Unmeasured mark, and it
 * is the same distinction `SpendCard` makes about a successfully-read empty
 * window.
 */
export function WhatPublished({
  posts,
  rows,
}: {
  /** Published posts, as the page already counted them. */
  posts: readonly unknown[]
  rows: readonly ComparableRow[]
}) {
  // Impressions is the column both tables order on, so it is the one whose
  // presence decides whether this page has anything to show — the same choice
  // `analyticsReadiness` makes, made from the same call.
  const coverage = coverageFor(rows, 'impressions')

  return (
    <StatStrip cols={3}>
      <StatCard
        label="Published"
        value={posts.length}
        unit={posts.length === 1 ? 'post' : 'posts'}
        note="Went out to at least one channel"
      />
      <StatCard
        label="Channels"
        value={rows.length}
        unit={rows.length === 1 ? 'channel' : 'channels'}
        note="Post and channel pairs in this window"
      />
      <StatCard
        label="Reporting"
        value={coverage.counted}
        unit={`of ${coverage.of}`}
        note={
          coverage.counted === coverage.of
            ? 'Every channel has returned a number'
            : 'Channels that have returned a number'
        }
      />
    </StatStrip>
  )
}
