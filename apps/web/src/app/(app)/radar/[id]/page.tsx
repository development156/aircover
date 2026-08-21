import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, ExternalLink } from 'lucide-react'

import { PageTitle } from '@/components/page-title'
import { ChangeFeed } from '@/components/radar/change-feed'
import { Observed, NotChecked } from '@/components/radar/marks'
import { connectedChannels } from '@/app/actions/radar'
import { radarStore } from '@/lib/radar/read'
import { COMPETITOR_KIND_LABELS } from '@/lib/radar/types'
import { getActiveWorkspace } from '@/lib/workspaces'

export const metadata = { title: 'Radar' }

/**
 * ONE BUSINESS, AND EVERY READ RADAR HAS OF IT.
 *
 * ── THE HARDEST REFUSAL ON THIS SCREEN IS A POSTING RATE ────────────────────
 * The obvious detail-view figure is "they post 4 times a week", computed by
 * counting the posts we observed and dividing by the weeks we have watched. It
 * is arithmetic on real rows and it is NOT TRUE: a weekly scan sees a page as it
 * stood at one instant, so anything published and taken down between two reads
 * never existed as far as this product is concerned. The count is a floor on
 * what they did, presented as a measurement of it.
 *
 * So there is no rate here. What there is instead is EVERY READ WE HAVE, with
 * its date — a fact about Sahoda's own scanning, which we can actually vouch
 * for — and the reader can see the sampling for themselves. A cadence claim only
 * appears when the collector emits one as an `ObservedFigure` with a snapshot
 * behind it, in which case it renders through the same gate as every other
 * number on this screen.
 *
 * ── PRICES OVER TIME ARE THE ONE SERIES THAT SURVIVES ───────────────────────
 * A price is a value printed ON the page we read. Two reads of the same page a
 * week apart give two prices, each tied to its own snapshot, and the pair is a
 * genuine observation rather than an inference — which is why price history is
 * rendered solid while a posting rate is not rendered at all.
 */
export default async function CompetitorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const workspace = await getActiveWorkspace()
  if (!workspace) notFound()

  const [snapshot, channels] = await Promise.all([
    radarStore().read(workspace.id),
    connectedChannels(),
  ])

  const competitor = snapshot.competitors.find((c) => c.id === id)
  if (!competitor) notFound()

  // Only this business's days, and only the days that have something of theirs
  // on them — including the days their page could not be read.
  const days = snapshot.days
    .map((day) => ({
      ...day,
      changes: day.changes.filter((c) => c.competitorId === id),
      attempts: day.attempts.filter((a) => a.competitorId === id),
    }))
    .filter((day) => day.changes.length > 0 || day.attempts.length > 0)

  const priceReadings = snapshot.days
    .flatMap((day) => day.changes)
    .filter((change) => change.competitorId === id && change.kind === 'price_changed')

  const reads = snapshot.days
    .flatMap((day) => day.changes)
    .filter((change) => change.competitorId === id)
    .flatMap((change) => change.evidence)
  const uniqueReads = [...new Map(reads.map((s) => [s.id, s])).values()].sort((a, b) =>
    a.observedAt < b.observedAt ? 1 : -1,
  )

  return (
    <div className="space-y-grid">
      <Link
        href="/radar"
        className="type-sm inline-flex items-center gap-1.5 text-muted hover:text-ink"
      >
        <ArrowLeft size={14} aria-hidden />
        All of Radar
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <PageTitle sub={COMPETITOR_KIND_LABELS[competitor.kind]}>{competitor.name}</PageTitle>
        <a
          href={competitor.url}
          target="_blank"
          // `noreferrer` as well as `noopener`: the destination is a competitor's
          // site, and there is no reason to hand it a referrer header naming the
          // Sahoda screen its rival was reading it from.
          rel="noopener noreferrer"
          className="type-sm inline-flex items-center gap-1.5 text-accent underline underline-offset-2"
        >
          Open their page
          <ExternalLink size={13} aria-hidden />
        </a>
      </div>

      <section aria-labelledby="comp-changes" className="flex flex-col gap-3">
        <h2 id="comp-changes" className="type-h2">
          What changed
        </h2>
        {days.length > 0 ? (
          <ChangeFeed days={days} competitors={[competitor]} channels={channels} />
        ) : competitor.lastObservedAt === null ? (
          <div className="surface-ring rounded-card bg-surface p-4">
            <NotChecked what={competitor.name} note="Radar has never managed to read this page." />
          </div>
        ) : (
          <p className="surface-ring rounded-card bg-surface p-4 type-body text-muted">
            Radar has read this page and found nothing that moved.
          </p>
        )}
      </section>

      {priceReadings.length > 0 ? (
        <section aria-labelledby="comp-prices" className="flex flex-col gap-3">
          <h2 id="comp-prices" className="type-h2">
            Prices we have seen
          </h2>
          <p className="type-body max-w-[68ch] text-muted">
            Each of these was printed on their own public page on the date beside it. Radar has no
            view of what anything actually sells for.
          </p>
          <div className="grid gap-2 narrow:grid-cols-2 wide:grid-cols-3">
            {priceReadings.flatMap((change) =>
              change.observation.figures.map((figure) => (
                <Observed
                  key={`${change.id}-${figure.label}`}
                  figure={figure}
                  evidence={change.evidence}
                />
              )),
            )}
          </div>
        </section>
      ) : null}

      <section aria-labelledby="comp-reads" className="flex flex-col gap-3">
        <h2 id="comp-reads" className="type-h2">
          Every read Radar has
        </h2>
        <p className="type-body max-w-[68ch] text-muted">
          This is the whole sample. Anything they put up and took down between two of these dates is
          invisible to Radar, so there is no &ldquo;posts per week&rdquo; figure on this page
          &mdash; it would be a count of what we happened to catch, dressed as a measurement of what
          they did.
        </p>
        {uniqueReads.length > 0 ? (
          <ul className="flex flex-col gap-1.5">
            {uniqueReads.map((read) => (
              <li
                key={read.id}
                className="type-sm flex flex-wrap items-baseline gap-x-2 text-muted"
              >
                <span className="num text-ink">{read.observedAt.slice(0, 10)}</span>
                <span className="min-w-0 truncate">{read.source}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="surface-ring rounded-card bg-surface p-4 type-body text-muted">
            No successful read yet.
          </p>
        )}
      </section>

      <section aria-labelledby="comp-limits" className="surface-ring rounded-card bg-surface p-4">
        <h2 id="comp-limits" className="type-h3">
          What Radar will never tell you about them
        </h2>
        <ul className="type-body mt-2 grid gap-1.5 text-muted">
          <li>&mdash; What they spent on anything.</li>
          <li>&mdash; Anything behind a login, a private account or a paywall.</li>
          <li>&mdash; Their revenue, their customer count, or how they are doing.</li>
          <li>&mdash; How many people saw or responded to any of it.</li>
        </ul>
      </section>
    </div>
  )
}
