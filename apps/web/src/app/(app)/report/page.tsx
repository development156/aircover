import Link from 'next/link'
import type { Route } from 'next'

import { NoticedBlock } from '@/components/report/noticed'
import { ReportBody } from '@/components/report/report-body'
import { SamplePreview } from '@/components/report/sample'
import { WhatsappButton } from '@/components/report/whatsapp-button'
import { PageTitle } from '@/components/page-title'
import type { Channel } from '@sahoda/shared'
import { reflectionWindow } from '@/lib/loop/iso-week'
import { readBrainObservations } from '@/lib/brain/read'
import { readLoop } from '@/lib/loop/read'
import { readCycleLearnings } from '@/lib/loop/report'
import { comparedEnquiries, comparedReach, comparedReplies } from '@/lib/report/compose'
import type { PlanRow, ReportView } from '@/lib/report/model'
import { toPlainText } from '@/lib/report/plain-text'
import { readEnquiries, readPlanTimes, readReach, readReplies } from '@/lib/report/read'
import { REPORT } from '@/lib/report/strings'
import { verdictOf } from '@/lib/report/verdict'
import { formatScheduledAt } from '@/lib/posts/schedule-format'

export const metadata = { title: 'CMO Report' }

/**
 * THE CMO REPORT — a weekly note from an employee to their boss.
 *
 * ── NOT A DASHBOARD, AND THE DIFFERENCE IS WHO DOES THE THINKING ─────────────
 * A dashboard hands somebody numbers and asks them to work out what they mean.
 * This page states the conclusion first, in the largest type on it, and keeps
 * the raw evidence on Analytics where somebody who wants to check the working
 * can go and check it. The whole promise of this product is that the owner does
 * not have to open a dashboard; this is the page that proves it or does not.
 *
 * ── THE SHAPE IS FIXED, THE CONTENT IS NOT ───────────────────────────────────
 * Verdict, three numbers, what worked, what changed, the plan, one action, cost.
 * Every one of those blocks renders in every state — it says what it does not
 * know rather than disappearing, because a section that vanishes teaches the
 * reader nothing and a section that says why it is empty teaches them what would
 * fill it.
 *
 * ── THE ONE EXCEPTION IS A WORKSPACE WITH NOTHING AT ALL ─────────────────────
 * Five cards each saying "nothing" is what this page used to be, and it was
 * measured at 71% empty screen. A workspace with no channel gets one card with
 * one action, and beneath it the real layout at 40% opacity so they can see what
 * they are being promised.
 */
export default async function ReportPage() {
  const [read, brain] = await Promise.all([readLoop(), readBrainObservations()])

  if (read.status !== 'ok') {
    return (
      <div className="space-y-grid">
        <Header text={null} />
        <p className="surface-ring rounded-card bg-surface p-4 type-body text-muted">
          {read.status === 'no-workspace' ? REPORT.failure.workspace : REPORT.verdict.unreadable}
        </p>
      </div>
    )
  }

  const snapshot = read.snapshot
  const cycle = snapshot.cycle
  const nothingConnected = snapshot.connected.length === 0 && snapshot.lapsed.length === 0

  /**
   * ── THE EMPTY STATE IS FOR A WORKSPACE WITH NOTHING, NOT ONE WITHOUT A CYCLE ─
   * This branch used to fire on `!cycle` as well, so a workspace with live
   * accounts and published posts that simply had not run the Loop yet was told
   * "Your first report lands next Monday" under a button reading "Connect a
   * channel" — a remedy they had already carried out, which is the impossible
   * remedy this codebase forbids by name. A connected workspace with no cycle
   * gets the real report shape instead, saying what it is waiting for.
   */
  if (nothingConnected) {
    return (
      <div className="space-y-grid">
        <Header text={null} />
        <div className="flex w-full max-w-[760px] flex-col gap-6">
          <section className="surface-ring rounded-card bg-surface p-4">
            <h2 className="type-h2 text-ink">{REPORT.empty.heading}</h2>
            <p className="type-body mt-1 max-w-[62ch] text-muted">{REPORT.empty.body}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Link
                href={REPORT.empty.primary.href as Route}
                className="inline-flex h-control items-center rounded-sm bg-primary type-sm px-3 font-[550] text-primary-foreground transition-micro hover:bg-ink hover:text-white dark:hover:bg-white dark:hover:text-[var(--canvas)]"
              >
                {REPORT.empty.primary.label}
              </Link>
              <Link
                href={REPORT.empty.secondary.href as Route}
                className="surface-ring-firm inline-flex h-control items-center rounded-sm bg-surface type-sm px-3 font-[550] text-ink transition-micro hover:bg-s2"
              >
                {REPORT.empty.secondary.label}
              </Link>
            </div>
          </section>
          <NoticedBlock brain={brain} />
          <SamplePreview />
        </div>
      </div>
    )
  }

  if (!cycle) {
    return (
      <div className="space-y-grid">
        <Header text={null} />
        <div className="flex w-full max-w-[760px] flex-col gap-6">
          <section className="surface-ring rounded-card bg-surface p-4">
            <h2 className="type-h2 text-ink">{REPORT.noCycle.heading}</h2>
            <p className="type-body mt-1 max-w-[62ch] text-muted">{REPORT.noCycle.body}</p>
            <Link
              href={REPORT.noCycle.action.href as Route}
              className="mt-3 inline-flex h-control items-center rounded-sm bg-primary type-sm px-3 font-[550] text-primary-foreground transition-micro hover:bg-ink hover:text-white dark:hover:bg-white dark:hover:text-[var(--canvas)]"
            >
              {REPORT.noCycle.action.label}
            </Link>
          </section>
          <NoticedBlock brain={brain} />
        </div>
      </div>
    )
  }

  const window = reflectionWindow(new Date(cycle.startedAt))
  const written = snapshot.briefs.filter((b) => b.postId !== null)

  /**
   * ONE ROUND TRIP, NOT SIX IN A ROW.
   *
   * Every read below depends only on the workspace and the week, both known the
   * moment the Loop snapshot arrives. Awaiting them one after another would add
   * their latencies together on a page a person opens on a phone.
   */
  const [reach, replies, enquiries, learnings, times] = await Promise.all([
    settled(readReach(read.workspaceId, window.fromIso, window.toIso), {
      status: 'unreadable' as const,
    }),
    settled(readReplies(read.workspaceId, window.fromIso, window.toIso), {
      status: 'unreadable' as const,
    }),
    settled(readEnquiries(read.workspaceId, window.fromIso, window.toIso), {
      status: 'unreadable' as const,
    }),
    settled(readCycleLearnings(read.workspaceId, cycle.id), []),
    settled(
      readPlanTimes(
        read.workspaceId,
        written.map((b) => b.postId as string),
      ),
      new Map<string, string | null>(),
    ),
  ])

  const plan: PlanRow[] = written.map((brief) => {
    const when = times.get(brief.postId as string) ?? null
    return {
      id: brief.id,
      title: brief.title,
      channels: brief.channels,
      when: formatScheduledAt(when),
      status:
        brief.stageOutcome === 'awaiting_approval'
          ? 'awaiting_approval'
          : when
            ? 'scheduled'
            : 'drafted',
    }
  })

  /**
   * WHAT I CHANGED, AND WHY ONLY THE ACCEPTED ONES COUNT.
   *
   * A learning the reader has not accepted has changed nothing: their brand is
   * unchanged and next week's writing will be the same either way. Listing it
   * here would claim the loop closed when it is still waiting on them. Only a
   * learning written into the Brand Brain has actually altered what Sahoda will
   * write, so only those are named.
   */
  const changed = learnings
    .filter((learning) => learning.status === 'accepted')
    .map((learning) => learning.summary)
    .slice(0, 4)

  const report: ReportView = {
    week: {
      label: `Week of ${day(window.fromIso)} to ${day(window.toIso)}`,
      postsRan: reach.status === 'ok' ? reach.postsRan : null,
      channels: snapshot.connected.map(channelName),
    },
    verdict:
      reach.status === 'ok' && replies.status === 'ok'
        ? verdictOf({
            postsMeasured: reach.postsMeasured,
            reach: { value: reach.value, baseline: reach.baseline },
            replies: { value: replies.value, previous: replies.previous },
          })
        : // A failed read is not a young workspace, and telling a two-year-old
          // one that Sahoda is "still learning your normal" would be a claim
          // about their history made out of a broken request.
          { kind: 'none', reason: 'unreadable' },
    numbers: {
      reach: comparedReach(reach),
      replies: comparedReplies(replies),
      enquiries: comparedEnquiries(enquiries),
    },
    worked: workedFrom(reach),
    changed,
    plan,
    oneThing: oneThingFor({
      unanswered: enquiries.status === 'ok' ? enquiries.unanswered : 0,
      awaiting: plan.filter((row) => row.status === 'awaiting_approval').length,
      lapsed: snapshot.lapsed.map(channelName),
      unconfirmed: snapshot.brain.total - snapshot.brain.confirmed,
    }),
    credits: { spent: cycle.spentCredits, budget: cycle.budgetCredits },
  }

  return (
    <div className="space-y-grid">
      <Header text={toPlainText(report)} />
      <ReportBody report={report} noticed={<NoticedBlock brain={brain} />} />
    </div>
  )
}

/**
 * A READ THAT THROWS IS A READ THAT FAILED, NOT A PAGE THAT DIES.
 *
 * Each read below already turns a query error into an honest "I could not read
 * this". None of them survived an EXCEPTION — a socket dropped mid-flight, a
 * malformed row, a date the formatter refuses — and one rejection inside
 * `Promise.all` takes the whole page with it, including the five sections that
 * had their answers. This is the seam between "one number is missing" and
 * "the report is gone", and it belongs here rather than in a boundary, because
 * a server component that throws never reaches one.
 */
function settled<T>(work: Promise<T>, fallback: T): Promise<T> {
  // `.catch` rather than try/await, so this adds no await of its own — an
  // awaited wrapper reads as a second sequential round trip to the waterfall
  // guard, and would be one if it were written the obvious way.
  return work.catch(() => fallback)
}

/**
 * BEST AND WEAKEST, FROM THE SAME ARITHMETIC AS THE NUMBER ABOVE THEM.
 *
 * The ranking used to come from a query that buckets readings by the day they
 * were TAKEN, with no join to the publish log — so on a page headed by last
 * week's dates it could name a post from three months ago and print its
 * lifetime total. These two come from the same per-post figures the reach card
 * is built from: published in the reported week, highest reading each.
 */
function workedFrom(reach: Awaited<ReturnType<typeof readReach>>): ReportView['worked'] {
  if (reach.status !== 'ok' || reach.posts.length < 2) return null
  const top = reach.posts[0]
  const bottom = reach.posts[reach.posts.length - 1]
  if (!top || !bottom) return null
  const shape = (post: { postId: string; title: string; channel: string; value: number }) => ({
    postId: post.postId,
    title: post.title,
    channel: post.channel as Channel,
    channelName: channelName(post.channel),
    value: post.value,
    measure: 'people reached',
  })
  return { best: shape(top), weakest: shape(bottom) }
}

function Header({ text }: { text: string | null }) {
  return (
    <div className="flex w-full max-w-[760px] flex-wrap items-start justify-between gap-3">
      <PageTitle sub={REPORT.subtitle}>{REPORT.title}</PageTitle>
      {text ? <WhatsappButton text={text} /> : null}
    </div>
  )
}

/**
 * THE ONE ACTION, CHOSEN BY WHAT IT IS WORTH TO THE BUSINESS.
 *
 * The order is not a guess about importance, it is a ranking by money. A person
 * who asked to hear from you and has not heard back is a sale walking away; a
 * post nobody approved is a week of work sitting still; a dead account is a
 * channel that will keep failing quietly; an unconfirmed brand makes everything
 * slightly worse without ever failing. Exactly one is offered, because a list of
 * four things to do is a list nobody does.
 */
function oneThingFor(input: {
  unanswered: number
  awaiting: number
  lapsed: readonly string[]
  unconfirmed: number
}): ReportView['oneThing'] {
  if (input.unanswered > 0) return REPORT.oneThing.enquiries(input.unanswered)
  if (input.awaiting > 0) return REPORT.oneThing.approvals(input.awaiting)
  const lapsed = input.lapsed[0]
  if (lapsed) return REPORT.oneThing.lapsed(lapsed)
  if (input.unconfirmed > 0) return REPORT.oneThing.brain(input.unconfirmed)
  return null
}

const CHANNEL_NAMES: Record<string, string> = {
  x: 'X',
  gbp: 'Google',
  linkedin: 'LinkedIn',
  instagram: 'Instagram',
}

function channelName(channel: string): string {
  return CHANNEL_NAMES[channel] ?? channel
}

/**
 * `timeZone: 'UTC'` because the window boundaries are calendar days derived in
 * UTC. Rendering them locally would show the previous day anywhere west of
 * Greenwich, on a report that names the week it covers.
 */
function day(isoDay: string): string {
  return new Date(`${isoDay}T00:00:00Z`).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  })
}
