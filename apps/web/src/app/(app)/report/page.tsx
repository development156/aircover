import Link from 'next/link'
import { Mail, MessageCircle, Monitor } from 'lucide-react'

import { PageTitle } from '@/components/page-title'
import { InertButton, InertChip, RoadmapBanner } from '@/components/roadmap/inert'
import { NotRunningNote } from '@/components/roadmap/parts'

export const metadata = { title: 'CMO Report' }

/**
 * THE CMO REPORT — drawn as a document, because that is what it is.
 *
 * ── WHY THIS IS NOT A DASHBOARD, AND THE DIFFERENCE IS THE WHOLE POINT ───────
 * Every competitor's "weekly summary" is a grid of tiles: reach, followers,
 * engagement rate, four sparklines. A grid of tiles asks the reader to do the
 * analysis. The CMO Report is the analysis — the thing a marketing employee
 * would hand you on a Monday: here is what worked, here is what did not, here is
 * what I changed my mind about, here is what I am doing this week.
 *
 * So it is set as a single column of prose blocks at reading measure, not as
 * cards in a grid. The form carries the claim: this is something you READ.
 * PRD §5.3 removed the 3D globe from the dashboard and named this as its
 * replacement for exactly this reason.
 *
 * ── THE SLOTS ARE NAMED AND EMPTY, AND THE EMPTINESS IS LOAD-BEARING ─────────
 * "Your best post last week" is a real thing this report will name — but naming
 * one requires a post, a metric read, and a comparison, none of which has
 * happened. A specimen ("Diwali offer — 2,400 reach") would be the single most
 * damaging invented figure in this app, because it would look exactly like the
 * real thing. Each block therefore states what will fill it and shows nothing.
 *
 * There is no date on this page either. A report has a week; this one has none,
 * because no week has been reported.
 */

const DELIVERY = [
  {
    icon: Monitor,
    where: 'Here, in the app',
    note: 'The full report, with every post it names linked.',
  },
  {
    icon: Mail,
    where: 'Your email',
    note: 'The same report, so it is waiting when you open your inbox.',
  },
  {
    icon: MessageCircle,
    where: 'WhatsApp',
    note: 'A short card with the headline and a link, once your number is verified.',
  },
] as const

/** A block of the report. Titled, explained, and empty of readings. */
function ReportBlock({
  eyebrow,
  title,
  what,
  children,
}: {
  eyebrow: string
  title: string
  what: string
  children?: React.ReactNode
}) {
  return (
    <section className="is-proposed rounded-card p-4">
      <p className="type-eyebrow text-muted">{eyebrow}</p>
      <h3 className="type-h3 mt-1 text-ink">{title}</h3>
      <p className="type-body mt-1 max-w-[68ch] text-muted">{what}</p>
      {children}
    </section>
  )
}

export default function ReportPage() {
  return (
    <div className="space-y-grid">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <PageTitle sub="The Monday read: what last week did, what Sahoda learned from it, and what it plans to do next.">
          CMO Report
        </PageTitle>
        <InertButton>Send me a copy</InertButton>
      </div>

      <RoadmapBanner what="A short written report every Monday morning, produced by the Loop at the end of each week." />

      {/* Week chips with no weeks in them: a date range would name a week that
          was never reported on. */}
      <div className="flex flex-wrap gap-1.5">
        <InertChip on>Latest</InertChip>
        <InertChip>Earlier weeks</InertChip>
      </div>

      {/* Reading measure, single column, on every width. A report is read top to
          bottom; putting these side by side would turn it back into a dashboard. */}
      <div className="flex max-w-[860px] flex-col gap-3">
        <ReportBlock
          eyebrow="Opens with"
          title="One sentence about your week"
          what="Not a number. The thing you would tell a friend who asked how the shop's marketing went — whether it was quiet, whether something landed, whether something broke."
        />
        <ReportBlock
          eyebrow="Then"
          title="The post that did best, and why"
          what="One post, named and linked, with a short reason: the hour it went out, the format, the thing it was about. The reason is the useful half — a winner with no explanation teaches nothing."
        />
        <ReportBlock
          eyebrow="And"
          title="The one that did worst, said plainly"
          what="The same treatment, without softening. A report that only prints good news is a report nobody acts on."
        />
        <ReportBlock
          eyebrow="The part that changes things"
          title="What Sahoda learned"
          what="One or two learnings, each written as a proposed change to your Brand Brain. You accept or reject each one. Nothing is written into your brand behind your back."
        >
          <p className="type-sm mt-2 text-muted">
            This is the step that makes next week&rsquo;s writing different from this week&rsquo;s.
          </p>
        </ReportBlock>
        <ReportBlock
          eyebrow="Ends with"
          title="This week's plan"
          what="The briefs the Loop intends to write, on the days it intends to publish them, with what it will cost before anything is spent. You can cut any of them here."
        />
      </div>

      <section
        aria-labelledby="report-delivery"
        className="surface-ring rounded-card bg-surface p-4"
      >
        <h2 id="report-delivery" className="type-h3">
          Where it arrives
        </h2>
        <ul className="mt-2 grid gap-2 wide:grid-cols-3">
          {DELIVERY.map((row) => (
            <li key={row.where} className="flex gap-2">
              <row.icon
                size={15}
                strokeWidth={1.8}
                aria-hidden
                className="mt-[3px] shrink-0 text-muted"
              />
              <span className="min-w-0">
                <span className="type-h3 block">{row.where}</span>
                <span className="type-sm block text-muted">{row.note}</span>
              </span>
            </li>
          ))}
        </ul>
      </section>

      <NotRunningNote>
        No report has been produced. The Loop that writes it is not running, so this page has no
        week to show &mdash; which is why every block above describes what will fill it rather than
        showing an example. What you CAN read today is on{' '}
        <Link href="/analytics" className="font-[550] text-accent underline underline-offset-2">
          Analytics
        </Link>
        , which reports what actually went out.
      </NotRunningNote>
    </div>
  )
}
