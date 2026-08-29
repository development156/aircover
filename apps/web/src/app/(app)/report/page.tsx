import Link from 'next/link'
import type { Route } from 'next'

import { NoticedBlock } from '@/components/report/noticed'
import { ReportBody } from '@/components/report/report-body'
import { SamplePreview } from '@/components/report/sample'
import { WhatsappButton } from '@/components/report/whatsapp-button'
import { PageTitle } from '@/components/page-title'
import { reflectionWindow } from '@/lib/loop/iso-week'
import { readBrainObservations } from '@/lib/brain/read'
import { readLoop } from '@/lib/loop/read'
import { readCycleLearnings, readRanking } from '@/lib/loop/report'
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

  if (nothingConnected || !cycle) {
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

  const window = reflectionWindow(new Date(cycle.startedAt))
  const written = snapshot.briefs.filter((b) => b.postId !== null)

  /**
   * ONE ROUND TRIP, NOT SIX IN A ROW.
   *
   * Every read below depends only on the workspace and the week, both known the
   * moment the Loop snapshot arrives. Awaiting them one after another would add
   * their latencies together on a page a person opens on a phone.
   */
  const [reach, replies, enquiries, ranking, learnings, times] = await Promise.all([
    readReach(read.workspaceId, window.fromIso, window.toIso),
    readReplies(read.workspaceId, window.fromIso, window.toIso),
    readEnquiries(read.workspaceId, window.fromIso, window.toIso),
    readRanking(read.workspaceId, window.fromIso, window.toIso, 'reach'),
    readCycleLearnings(read.workspaceId, cycle.id),
    readPlanTimes(
      read.workspaceId,
      written.map((b) => b.postId as string),
    ),
  ])

  const plan: PlanRow[] = written.map((brief) => ({
    id: brief.id,
    title: brief.title,
    channels: brief.channels,
    when: formatScheduledAt(times.get(brief.postId as string) ?? null),
    status: brief.stageOutcome === 'awaiting_approval' ? 'awaiting_approval' : 'drafted',
  }))

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
      postsRan: reach.status === 'ok' ? reach.postsRan : 0,
      channels: snapshot.connected.map(channelName),
    },
    verdict:
      reach.status === 'ok' && replies.status === 'ok'
        ? verdictOf({
            postsMeasured: reach.postsMeasured,
            reach: { value: reach.value, baseline: reach.baseline },
            replies: { value: replies.value, previous: replies.previous },
          })
        : { kind: 'none', reason: 'no-baseline' },
    numbers: {
      reach: comparedReach(reach),
      replies: comparedReplies(replies),
      enquiries: comparedEnquiries(enquiries),
    },
    worked: ranking
      ? {
          best: { ...ranking.top, measure: 'people reached' },
          weakest: { ...ranking.bottom, measure: 'people reached' },
        }
      : null,
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
