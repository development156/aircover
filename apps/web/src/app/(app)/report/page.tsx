import Link from 'next/link'
import {
  CalendarDays,
  ClipboardCheck,
  Clock,
  Coins,
  Eye,
  Lightbulb,
  Sparkles,
  TrendingUp,
} from 'lucide-react'

import { ObservationNote } from '@/components/brain/observation-note'
import { CHANNEL_LABELS } from '@/components/posts/channel-label'
import { metricInWords } from '@/lib/report/strings'
import { AtAGlanceCard, CreditsCard, InsightPromiseCard } from '@/components/report/insights'
import { ReportModule } from '@/components/report/module'
import { PageTitle } from '@/components/page-title'
import { reflectionWindow } from '@/lib/loop/iso-week'
import { bestSlotSentence } from '@/lib/analytics/timing'
import { readWindow } from '@/lib/analytics/window-data'
import { resolveView } from '@/lib/analytics/view-params'
import { readBrainObservations, type BrainRead } from '@/lib/brain/read'
import { brainWaiting } from '@/lib/brain/waiting'
import { readLoop } from '@/lib/loop/read'
import { readCycleLearnings, readRanking } from '@/lib/loop/report'
import { creditWord } from '@/lib/credit-words'
import { InertPanel } from '@/components/roadmap/parts'
import { readBalance } from '@/lib/wallet/read'

export const metadata = { title: 'CMO Report' }

/**
 * THE CMO REPORT — the Monday read, from what the cycle actually produced.
 *
 * ── STILL A DOCUMENT, NOT A DASHBOARD, AND THAT IS THE WHOLE POINT ───────────
 * wt-ia's reasoning holds and the form is unchanged: a single column of prose
 * blocks at reading measure, not cards in a grid. Every competitor's weekly
 * summary is a grid of tiles, and a grid of tiles asks the reader to do the
 * analysis. This is the analysis — the thing a marketing employee would hand you
 * on a Monday.
 *
 * ── WHAT CHANGED: THE BLOCKS ARE FILLED, OR THEY SAY WHY NOT ─────────────────
 * The roadmap version described what would fill each block and showed nothing,
 * and it closed with a note saying no report had been produced. That note is
 * false the moment a cycle finishes, so it is gone — replaced by an empty state
 * that says the same thing only when it is still true.
 *
 * ── EVERY FIGURE IS FROM A QUERY, OR ABSENT ──────────────────────────────────
 * Absent, not zero and not a dash. A zero is a measurement of nothing, which is
 * a claim about the reader's business; a dash is a zero in a costume. Where
 * there is no ranking to make — fewer than two posts measured — the block says
 * so, because one post is simultaneously the best and the worst and printing
 * that is worse than printing nothing.
 *
 * ── THERE WAS A SECOND, COMPLETE DESIGN OF THIS SCREEN. IT IS GONE ───────────
 * `components/report/report-body.tsx` and the whole of `lib/report/` were a
 * rival CMO Report: a verdict-first weekly note with a WhatsApp plain-text
 * variant. Both designs were finished, both were argued for in their own
 * headers, and one screen cannot have two.
 *
 * The choice was already made twice before anybody wrote it down. `87abe541`
 * replaced the page with this one, and `af3c20cc` deleted the five readers the
 * other design needed — `readReach`, `readReplies`, `readEnquiries`,
 * `readPlanTimes`, `readPostTitles` — as dead code. So mounting it was never a
 * missing import; it was rebuilding a data layer that had been removed on
 * purpose, to reinstate a design that had been replaced on purpose.
 *
 * Deleted 2026-09-04: 11 modules and 4 test files, a closed cluster whose every
 * product consumer was inside itself. Nothing outside it referred to any of it,
 * which is why it could sit there complete and unreachable. If the verdict-first
 * form is ever wanted back, it is in git and this comment names the commit that
 * removed it — bring back the design AND its readers, and delete this one.
 */
/**
 * The report's own table of contents, and it is the SAME list the filled report
 * renders below — same order, same titles. Written once here so the shape a
 * reader is shown before their first cycle cannot drift from the document they
 * eventually get, which is the way a preview turns into a lie.
 */
const REPORT_OUTLINE: ReadonlyArray<{ title: string; what: string }> = [
  {
    title: 'How it went',
    what: 'What went out last week, on which channels, and how much of it a person saw.',
  },
  {
    title: 'The post that reached the most people',
    what: 'The single best-performing post of the week, and the one that did least, named only when at least two were measured.',
  },
  {
    title: 'What Sahoda noticed',
    what: 'Things Sahoda worked out about your marketing on its own, each shown with the numbers behind it.',
  },
  {
    title: 'What Sahoda learned',
    what: 'The part that changes things: what the week suggests about what to write next.',
  },
  {
    title: 'This week\u2019s plan',
    what: 'What Sahoda intends to do about it, before you approve any of it.',
  },
  { title: 'Credits used', what: 'What the cycle cost, entry by entry.' },
]

export default async function ReportPage() {
  // Read together, and the Marketing Brain read is NOT conditional on a cycle.
  // That is the point of the second brain: a workspace that has never run the
  // Loop has still published captions, and "you have stopped using exclamation
  // marks" is computable from those alone. Gating this behind a cycle would have
  // hidden the one block that works before a customer has spent anything.
  const [read, brain, balance] = await Promise.all([
    readLoop(),
    readBrainObservations(),
    /**
     * IN THE BATCH, NOT IN FRONT OF IT. `readBalance` is `cache()`d and the
     * layout's credit chip has already asked for it this render, so this is a
     * shared promise rather than a second query — and putting it on its own
     * line would add a round trip in front of the two reads that were already
     * here, which `lib/perf/read-waterfall.test.ts` exists to refuse.
     */
    readBalance(),
  ])

  // "You have no workspace" and "we could not look" are different claims with
  // different remedies, and this page used to make the first one on both arms.
  // The third sentence below matters just as much: a `loop_cycles` read that
  // failed used to render "No week has been reported yet", which is a statement
  // about the customer's business that no query had earned.
  if (read.status !== 'ok') {
    return (
      <div className="space-y-6">
        <ReportHeader week={null} />
        <p className="surface-ring rounded-card bg-surface p-5 type-body text-muted">
          {read.status === 'no-workspace'
            ? 'Finish setting up your workspace and your reports appear here.'
            : 'Sahoda couldn’t read your cycles just now, so it can’t say whether a week has been reported. Try again in a moment.'}
        </p>
      </div>
    )
  }

  const workspace = { id: read.workspaceId }
  const snapshot = read.snapshot
  const cycle = snapshot.cycle

  if (!cycle) {
    /**
     * ── NOTHING TO REPORT IS NOT NOTHING TO SHOW ─────────────────────────────
     * MEASURED at 1440 on a workspace whose Loop has never run: this branch drew
     * a page title, a subtitle and one 1136x100 card holding two sentences, and
     * then 640px of empty page — 71% of the viewport. A reader who clicked "CMO
     * Report" learned exactly one thing: that they do not have one.
     *
     * The blocks below are the SAME five the filled report renders, in the same
     * order, each carrying the sentence that describes what goes in it. They are
     * `is-proposed` — dashed, the rung that means "Sahoda suggests", never
     * `is-simulated`, which docs/26 §3.1 defines as "not real, a fixture" and
     * would be a claim that this report is fake rather than unwritten.
     *
     * NOT ONE OF THEM HOLDS A FIGURE. Not a zero, not a dash, not a placeholder
     * bar. The container is a promise about Sahoda, which is allowed; a number
     * in it would be a claim about the reader's week, which is not.
     *
     * The heading and the one action still lead — §16 rule 1, the reader is
     * blocked and running a cycle is the remedy — and everything below is
     * visibly subordinate to it.
     */
    return (
      <div className="space-y-6">
        <ReportHeader week={null} />

        <section className="surface-ring rounded-card bg-surface p-5 shadow-card">
          <h2 className="type-h2">No week has been reported yet</h2>
          <p className="type-body mt-1 max-w-[68ch] text-muted">
            A report is written at the end of each Loop cycle. Run one from{' '}
            <Link href="/loop" className="font-[550] text-accent underline underline-offset-2">
              The Loop
            </Link>{' '}
            and this page fills in. What you can read today is on{' '}
            <Link href="/analytics" className="font-[550] text-accent underline underline-offset-2">
              Analytics
            </Link>
            , which reports what actually went out.
          </p>
        </section>

        <BrainBlock brain={brain} n={1} />

        <div>
          <p className="type-eyebrow text-muted">What Monday&rsquo;s report says</p>
          <div className="mt-3 space-y-3">
            {REPORT_OUTLINE.map((block) => (
              <InertPanel key={block.title} title={block.title} what={block.what} />
            ))}
          </div>
        </div>
      </div>
    )
  }

  const window = reflectionWindow(new Date(cycle.startedAt))
  const [ranking, learnings, timingRead] = await Promise.all([
    readRanking(workspace.id, window.fromIso, window.toIso),
    readCycleLearnings(workspace.id, cycle.id),
    /**
     * THE SAME READ /analytics MAKES, calling the same function.
     *
     * Not a second query shaped like it: `readWindow` is one function and
     * `bestSlotSentence` is one code path, so the sentence below and the grid on
     * Analytics come from identical data through identical arithmetic. Two
     * implementations of "the best time to post" disagree eventually, and the
     * customer meets the two screens an hour apart.
     *
     * The default view is passed because the timing grid deliberately ignores
     * the date window: it is a claim about the business rather than about
     * thirty days, and a best slot that moved whenever somebody changed a date
     * filter would not be a pattern.
     */
    readWindow(resolveView({})),
  ])

  const slotSentence = timingRead.kind === 'ready' ? bestSlotSentence(timingRead.timing) : null

  const written = snapshot.briefs.filter((b) => b.postId !== null)
  // The three-card column only promises insights while there genuinely are
  // none. Beside real ones it would read as a product that had not noticed its
  // own output.
  // ── THREE ANSWERS, BECAUSE A FAILED READ IS NOT AN EMPTY ONE ──────────────
  // This was a boolean, and `brain.status !== 'ok'` fell into the false arm — so
  // a workspace whose Brand Brain could not be read got `InsightPromiseCard`
  // ("Once your posts start rolling, you'll see clear insights here every
  // Monday"), which blames the empty column on them not having posted, directly
  // beside a block saying the read failed. The promise may only be made when we
  // actually KNOW there is nothing.
  const findings: 'some' | 'none' | 'unknown' =
    learnings.length > 0 || (brain.status === 'ok' && brain.observations.length > 0)
      ? 'some'
      : brain.status === 'ok'
        ? 'none'
        : 'unknown'

  return (
    <div className="space-y-6">
      <ReportHeader week={`Week ${cycle.isoWeek}, ${cycle.isoYear}`} />

      {/* ── THE BRIEFING, AND A COLUMN BESIDE IT ────────────────────────────
          THE MEASURE IS ON THE PROSE, NOT ON THE COLUMN. The document was
          capped at 860px inside a track that is 928px at 1440 — MEASURED, a
          68px dead gutter down the whole page between the cards and the
          insights column, which reads as a layout that failed to fill rather
          than as a margin. The cards fill their track; every paragraph inside
          them still stops at 68ch, which is where the measure actually
          belongs. Same reading line, no ragged edge.

          The insights column collapses UNDER the report below 1180px rather
          than squeezing: a 240px "at a glance" card is four figures nobody can
          scan. */}
      <div className="grid items-start gap-6 wide:grid-cols-[minmax(0,1fr)_320px]">
        <div className="flex min-w-0 flex-col gap-4">
          {/* ── 01 · LAST WEEK ──────────────────────────────────────────── */}
          <ReportModule n={1} eyebrow="Last week" title="How it went" icon={TrendingUp}>
            {ranking ? (
              <p className="type-body max-w-[68ch] text-muted">
                <span className="num">{ranking.postsMeasured}</span> of your posts were measured
                between {fullDay(window.fromIso)} and {fullDay(window.toIso)}.
              </p>
            ) : (
              <p className="type-body max-w-[68ch] text-muted">
                {cycle.reflectSkippedNoHistory
                  ? 'Nothing of yours has been measured yet, so there is nothing to report on last week. This fills in once posts have gone out and the numbers have come back.'
                  : 'Fewer than two of your posts were measured last week, so there is no best and worst to name. With one post, the same post is both.'}
              </p>
            )}
          </ReportModule>

          {ranking ? (
            <>
              <ReportModule
                n={2}
                eyebrow="Then"
                title="The post that reached the most people"
                icon={TrendingUp}
              >
                <p className="type-body max-w-[68ch] text-ink">{ranking.top.title}</p>
                <p className="type-sm mt-1 text-muted">
                  <span className="num">{ranking.top.value}</span>{' '}
                  {metricInWords(ranking.top.metric)} on {CHANNEL_LABELS[ranking.top.channel]}.
                </p>
              </ReportModule>
              <ReportModule
                n={3}
                eyebrow="And"
                title="The one that reached the fewest"
                icon={TrendingUp}
              >
                <p className="type-body max-w-[68ch] text-ink">{ranking.bottom.title}</p>
                <p className="type-sm mt-1 text-muted">
                  <span className="num">{ranking.bottom.value}</span>{' '}
                  {metricInWords(ranking.bottom.metric)} on {CHANNEL_LABELS[ranking.bottom.channel]}
                  .
                </p>
                {/* NO REASON IS GIVEN, and its absence is deliberate. Every
                    candidate reason would be Sahoda asserting a CAUSE, and
                    nothing here has tested one — a post did worse and why is
                    not something this query knows. */}
                <p className="type-sm mt-2 text-muted">
                  Sahoda has not worked out why, and will not guess.
                </p>
              </ReportModule>
            </>
          ) : null}

          {/* ── WHAT IT NOTICED, UNPROMPTED ─────────────────────────────── */}
          <BrainBlock brain={brain} n={ranking ? 4 : 2} />

          {/* ── WHAT IT LEARNED ─────────────────────────────────────────── */}
          <ReportModule
            n={ranking ? 5 : 3}
            eyebrow="The part that changes things"
            title="What Sahoda learned"
            icon={Lightbulb}
          >
            {learnings.length === 0 ? (
              <p className="type-body max-w-[68ch] text-muted">
                {cycle.reflectSkippedNoHistory
                  ? 'Nothing. There was nothing to learn from. No post of yours has been measured, so Sahoda ran no insight pass at all rather than inventing one.'
                  : 'Nothing this week. Sahoda read your numbers and found no difference big enough to be worth acting on, which is a real answer and not a failure.'}
              </p>
            ) : (
              <ul className="grid gap-2">
                {learnings.map((learning, index) => (
                  <li key={index} className="rounded-input bg-surface-2 p-3">
                    <p className="type-body text-ink">{learning.summary}</p>
                    <p className="type-sm mt-1 text-muted">
                      {learning.status === 'accepted'
                        ? `You added this to your Brand Brain${learning.appliedVersion !== null ? ` (version ${learning.appliedVersion})` : ''}.`
                        : learning.status === 'rejected'
                          ? 'You turned this down. Your Brand Brain is unchanged.'
                          : 'Waiting for you on the Loop screen. Nothing has been written into your brand.'}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </ReportModule>

          {/* ── THIS WEEK ───────────────────────────────────────────────── */}
          <ReportModule
            n={ranking ? 6 : 4}
            eyebrow="Ends with"
            title="This week&rsquo;s plan"
            icon={ClipboardCheck}
          >
            {written.length === 0 ? (
              <p className="type-body max-w-[68ch] text-muted">
                Nothing has been written for this week yet.
              </p>
            ) : (
              <ul className="grid gap-2">
                {written.map((brief) => (
                  <li key={brief.id} className="rounded-input bg-surface-2 p-3">
                    <p className="type-body text-ink">{brief.title}</p>
                    <p className="type-sm mt-1 text-muted">
                      {brief.channels.join(' · ')}
                      {brief.stageOutcome === 'awaiting_approval'
                        ? '. Scheduled, waiting for your approval'
                        : '. A draft in your Planner'}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </ReportModule>

          {/* ── WHEN TO POST ─────────────────────────────────────────────
              THE SENTENCE COMES FROM THE SAME SELECTOR ANALYTICS DRAWS ITS GRID
              FROM. `bestSlotSentence(timing)` is the only code path that
              produces it, and Analytics renders the identical string beneath
              its heatmap. Two calculations of "the best time to post" WILL
              disagree, and the customer meets the two screens an hour apart.

              It renders nothing when the selector has no defensible winner.
              Nothing, rather than a hedge: "no best time found" invites the
              reader to believe there is one and Sahoda is being coy. */}
          {slotSentence ? (
            <ReportModule
              n={ranking ? 7 : 5}
              eyebrow="What the numbers say about timing"
              title="When to post"
              icon={Clock}
            >
              <p className="type-body max-w-[68ch] text-ink">{slotSentence}</p>
              <p className="type-sm mt-1 text-muted">
                Worked out from every post you have published, each read at the same age so an older
                post does not win for being older.{' '}
                <Link href="/analytics" className="underline-offset-2 hover:underline">
                  See the grid behind this
                </Link>
                .
              </p>
            </ReportModule>
          ) : null}

          {/* ── THE MONEY, and the one module that carries the accent ───── */}
          <ReportModule
            n={ranking ? 8 : 6}
            eyebrow="And what it cost"
            title="Credits used"
            icon={Coins}
            accent
          >
            <dl className="grid gap-2">
              <div className="flex items-baseline justify-between gap-4 border-b border-line-soft pb-2">
                <dt className="type-body text-muted">Spent on this week</dt>
                <dd className="type-body num text-ink">{cycle.spentCredits} cr</dd>
              </div>
              {cycle.budgetCredits !== null ? (
                <div className="flex items-baseline justify-between gap-4">
                  <dt className="type-body text-muted">Your weekly budget</dt>
                  <dd className="type-body num text-muted">{cycle.budgetCredits} cr</dd>
                </div>
              ) : null}
            </dl>
            {cycle.approvedCredits !== null && cycle.estimatedCredits !== null ? (
              <p className="type-sm mt-3 max-w-[68ch] text-muted">
                Sahoda proposed <span className="num">{cycle.estimatedCredits}</span>{' '}
                {creditWord(cycle.estimatedCredits ?? 0)} of writing; you approved{' '}
                <span className="num">{cycle.approvedCredits}</span>.
              </p>
            ) : null}
            {/* ── THE WALLET LINK IS ON THE CREDITS CARD, NOT HERE ────────
                It used to be here, and the insights column now carries it on
                the card that shows the balance — which is where somebody
                reading a figure and wanting its detail actually looks. Two
                copies of one link to one destination, a screen apart, is the
                duplicate the brief calls out. Below 1180 the card sits
                directly under this module, so the link is still in reach. */}
          </ReportModule>
        </div>

        {/* ── THE INSIGHTS COLUMN ─────────────────────────────────────────
            Every figure on it was already read for the document beside it, so
            this adds no query. There is no chart: see the component header for
            the one thing in the brief that could not be built honestly. */}
        <aside className="flex flex-col gap-4 wide:sticky wide:top-6">
          <AtAGlanceCard
            figures={[
              { label: 'Posts measured', value: ranking ? ranking.postsMeasured : null },
              { label: 'Written this week', value: written.length },
              { label: 'Spent', value: cycle.spentCredits, unit: 'cr' },
              {
                label: 'Approved',
                value: cycle.approvedCredits,
                unit: 'cr',
                // Null here means no spending was ever put to this person for
                // approval, which is not a reading we failed to take. It was
                // announced as "Approved has not been measured yet".
                absent: 'Nothing has been put to you for approval in this cycle',
              },
            ]}
            note={
              ranking
                ? `Measured between ${fullDay(window.fromIso)} and ${fullDay(window.toIso)}.`
                : 'No performance data yet.'
            }
          />
          <CreditsCard balance={balance} spent={cycle.spentCredits} budget={cycle.budgetCredits} />
          {findings === 'none' ? <InsightPromiseCard /> : null}
        </aside>
      </div>
    </div>
  )
}

/**
 * The page's head, identical on the empty branch and the filled one.
 *
 * It was two hand-written copies before, and they had already drifted: the
 * filled branch carried the week and the empty one did not, which is correct,
 * but the empty one also lost the alignment the filled one had. One component,
 * and the week is the only thing that varies.
 *
 * ── THE WEEK IS A LABEL, NOT A PICKER ────────────────────────────────────────
 * The brief draws it with a dropdown chevron. There is no week switching behind
 * this page — `readLoop` returns the current cycle and nothing takes a week
 * argument — so a chevron would be an affordance that opens nothing, which is
 * the same defect class as a remedy that cannot work. It gets the calendar mark
 * and the pill, and no chevron, until something can be chosen.
 */
function ReportHeader({ week }: { week: string | null }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
      <div className="flex min-w-0 items-start gap-3">
        <span
          aria-hidden
          className="mt-1 grid size-8 flex-none place-items-center rounded-[10px] bg-tint-100 text-accent dark:bg-s2"
        >
          <Sparkles size={17} strokeWidth={1.9} />
        </span>
        <PageTitle sub="The Monday read: what last week did, what Sahoda learned from it, and what it plans to do next.">
          CMO Report
        </PageTitle>
      </div>
      {week ? (
        <p className="surface-ring inline-flex flex-none items-center gap-2 rounded-pill bg-surface px-3.5 py-2 type-sm font-[550] text-ink">
          <CalendarDays size={15} strokeWidth={1.8} aria-hidden className="text-muted" />
          <span className="num">{week}</span>
        </p>
      ) : null}
    </div>
  )
}

/**
 * A date the way a person writes one.
 *
 * `timeZone: 'UTC'` because the window boundaries are calendar DAYS derived in
 * UTC. Rendering them in the reader's local zone would show the previous day
 * anywhere west of Greenwich — a report claiming to cover a week it did not.
 * Same reasoning, same call, as the campaign page's `fullDay`.
 */
function fullDay(isoDay: string): string {
  return new Date(`${isoDay}T00:00:00Z`).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  })
}

/**
 * THE MARKETING BRAIN'S BLOCK — the same shape in both branches of this page.
 *
 * ── FOUR STATES, AND THE TWO EMPTY ONES SAY DIFFERENT THINGS ────────────────
 * `lib/inbox/emptiness.ts` exists because "we never asked" and "we asked and got
 * nothing" are different sentences, and this block has the same pair. A failed
 * read must not say the customer has published too little, and a customer who
 * has published too little must not be offered a reload. Both would be the
 * impossible remedy `no-impossible-remedy.spec.ts` guards against.
 *
 * ── AND IT NAMES THE FLOOR RATHER THAN THE OUTCOME ──────────────────────────
 * "Sahoda has not noticed anything yet" is true and useless. It reads as a
 * product that is not working. Saying that observations need a run of published
 * posts behind them tells the reader what would change it, which is the same
 * distinction the Loop's refusal copy draws.
 */
function BrainBlock({ brain, n }: { brain: BrainRead; n: number }) {
  return (
    <ReportModule n={n} eyebrow="Noticed on its own" title="What Sahoda noticed" icon={Eye}>
      {brain.status === 'error' ? (
        <p className="type-body max-w-[68ch] text-muted">
          Sahoda couldn&rsquo;t read what it has noticed just now, so this block can&rsquo;t say
          whether there is anything. Try again in a moment.
        </p>
      ) : brain.status === 'no-workspace' ? (
        <p className="type-body max-w-[68ch] text-muted">
          Finish setting up your workspace and this fills in.
        </p>
      ) : brain.observations.length === 0 ? (
        <BrainWaitingNote brain={brain} />
      ) : (
        <ul className="grid gap-2">
          {brain.observations.map((observation) => (
            <li key={`${observation.kind}:${observation.subject}:${observation.computedOn}`}>
              <ObservationNote observation={observation} />
            </li>
          ))}
        </ul>
      )}
    </ReportModule>
  )
}

/**
 * WHY THE BLOCK IS EMPTY, WHICH IS A DIFFERENT SENTENCE EVERY WEEK.
 *
 * This used to be one static paragraph, and it read identically in week 1 and
 * week 20 — so a customer whose report had been empty for two months could not
 * tell a product that is working and waiting from a cron that stopped. The
 * brain is most invisible exactly when it has run longest with nothing to say,
 * and that is the moment this note exists for.
 *
 * Two claims, never merged: it has never looked here, or it looked on a named
 * day and is short of something nameable. `lib/brain/waiting.ts` keeps them
 * apart and its tests pin the separation.
 */
function BrainWaitingNote({ brain }: { brain: Extract<BrainRead, { status: 'ok' }> }) {
  const waiting = brainWaiting(brain.lastPass)

  if (waiting.state === 'never-examined') {
    return (
      <p className="type-body max-w-[68ch] text-muted">
        Sahoda has not looked at this workspace yet. It reads your published posts once a week and
        only speaks when the numbers are strong enough to stand behind.
      </p>
    )
  }

  return (
    <div className="space-y-2">
      <p className="type-body max-w-[68ch] text-muted">
        Sahoda last looked on <span className="num">{waiting.lastLookedOn}</span> and had nothing it
        could stand behind.
      </p>
      {waiting.reasons.length > 0 && (
        <ul className="grid gap-1 border-l-2 border-line pl-2.5">
          {waiting.reasons.map((reason) => (
            <li key={reason} className="type-sm max-w-[68ch] text-muted">
              {reason}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
