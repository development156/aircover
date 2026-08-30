import Link from 'next/link'

import { ObservationNote } from '@/components/brain/observation-note'
import { PageTitle } from '@/components/page-title'
import { reflectionWindow } from '@/lib/loop/iso-week'
import { readBrainObservations, type BrainRead } from '@/lib/brain/read'
import { brainWaiting } from '@/lib/brain/waiting'
import { readLoop } from '@/lib/loop/read'
import { readCycleLearnings, readRanking } from '@/lib/loop/report'
import { creditWord } from '@/lib/credit-words'
import { InertPanel } from '@/components/roadmap/parts'

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
  const [read, brain] = await Promise.all([readLoop(), readBrainObservations()])

  // "You have no workspace" and "we could not look" are different claims with
  // different remedies, and this page used to make the first one on both arms.
  // The third sentence below matters just as much: a `loop_cycles` read that
  // failed used to render "No week has been reported yet", which is a statement
  // about the customer's business that no query had earned.
  if (read.status !== 'ok') {
    return (
      <div className="space-y-grid">
        <PageTitle sub="The Monday read: what last week did, what Sahoda learned from it, and what it plans to do next.">
          CMO Report
        </PageTitle>
        <p className="surface-ring rounded-card bg-surface p-4 type-body text-muted">
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
      <div className="space-y-grid">
        <PageTitle sub="The Monday read: what last week did, what Sahoda learned from it, and what it plans to do next.">
          CMO Report
        </PageTitle>

        <section className="surface-ring rounded-card bg-surface p-4">
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

        <BrainBlock brain={brain} />

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
  const [ranking, learnings] = await Promise.all([
    readRanking(workspace.id, window.fromIso, window.toIso),
    readCycleLearnings(workspace.id, cycle.id),
  ])

  const written = snapshot.briefs.filter((b) => b.postId !== null)

  return (
    <div className="space-y-grid">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <PageTitle sub="The Monday read: what last week did, what Sahoda learned from it, and what it plans to do next.">
          CMO Report
        </PageTitle>
        {/* A real week, so a real date. The roadmap version had none, and said
            so — "a report has a week; this one has none". This one has one. */}
        <p className="type-sm num mt-1 text-muted">
          Week {cycle.isoWeek}, {cycle.isoYear}
        </p>
      </div>

      <div className="flex max-w-[860px] flex-col gap-3">
        {/* ── LAST WEEK ─────────────────────────────────────────────────── */}
        <Block eyebrow="Last week" title="How it went">
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
        </Block>

        {ranking ? (
          <>
            <Block eyebrow="Then" title="The post that reached the most people">
              <p className="type-body max-w-[68ch] text-ink">{ranking.top.title}</p>
              <p className="type-sm mt-1 text-muted">
                <span className="num">{ranking.top.value}</span> {ranking.top.metric} on{' '}
                {ranking.top.channel}.
              </p>
            </Block>
            <Block eyebrow="And" title="The one that reached the fewest">
              <p className="type-body max-w-[68ch] text-ink">{ranking.bottom.title}</p>
              <p className="type-sm mt-1 text-muted">
                <span className="num">{ranking.bottom.value}</span> {ranking.bottom.metric} on{' '}
                {ranking.bottom.channel}.
              </p>
              {/* NO REASON IS GIVEN, and its absence is deliberate. wt-ia's
                  version promised "a short reason: the hour it went out, the
                  format, the thing it was about". Every one of those would be
                  Sahoda asserting a CAUSE, and nothing here has tested one — a
                  post did worse and why is not something this query knows. */}
              <p className="type-sm mt-2 text-muted">
                Sahoda has not worked out why, and will not guess.
              </p>
            </Block>
          </>
        ) : null}

        {/* ── WHAT IT NOTICED, UNPROMPTED ───────────────────────────────── */}
        <BrainBlock brain={brain} />

        {/* ── WHAT IT LEARNED ───────────────────────────────────────────── */}
        <Block eyebrow="The part that changes things" title="What Sahoda learned">
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
        </Block>

        {/* ── THIS WEEK ─────────────────────────────────────────────────── */}
        <Block eyebrow="Ends with" title="This week's plan">
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
        </Block>

        {/* ── THE MONEY ─────────────────────────────────────────────────── */}
        <Block eyebrow="And what it cost" title="Credits used">
          <dl className="grid gap-1">
            <div className="flex justify-between gap-4">
              <dt className="type-body text-muted">Spent on this week</dt>
              <dd className="type-body num text-ink">{cycle.spentCredits} cr</dd>
            </div>
            {cycle.budgetCredits !== null ? (
              <div className="flex justify-between gap-4">
                <dt className="type-body text-muted">Your weekly budget</dt>
                <dd className="type-body num text-muted">{cycle.budgetCredits} cr</dd>
              </div>
            ) : null}
            {cycle.approvedCredits !== null && cycle.estimatedCredits !== null ? (
              <p className="type-sm mt-1 text-muted">
                Sahoda proposed <span className="num">{cycle.estimatedCredits}</span>{' '}
                {creditWord(cycle.estimatedCredits ?? 0)} of writing; you approved{' '}
                <span className="num">{cycle.approvedCredits}</span>.
              </p>
            ) : null}
          </dl>
          <p className="type-sm mt-3">
            <Link href="/wallet" className="font-[550] text-accent underline underline-offset-2">
              See every charge in your wallet
            </Link>
          </p>
        </Block>
      </div>
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
function BrainBlock({ brain }: { brain: BrainRead }) {
  return (
    <Block eyebrow="Noticed on its own" title="What Sahoda noticed">
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
    </Block>
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

function Block({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string
  title: string
  children: React.ReactNode
}) {
  return (
    <section className="surface-ring rounded-card bg-surface p-4">
      <p className="type-eyebrow text-muted">{eyebrow}</p>
      <h3 className="type-h3 mt-1 text-ink">{title}</h3>
      <div className="mt-2">{children}</div>
    </section>
  )
}
