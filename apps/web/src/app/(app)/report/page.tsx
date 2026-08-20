import Link from 'next/link'

import { PageTitle } from '@/components/page-title'
import { reflectionWindow } from '@/lib/loop/iso-week'
import { readLoopSnapshot } from '@/lib/loop/read'
import { readCycleLearnings, readRanking } from '@/lib/loop/report'
import { getActiveWorkspace } from '@/lib/workspaces'

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
export default async function ReportPage() {
  const workspace = await getActiveWorkspace()
  if (!workspace) {
    return (
      <div className="space-y-grid">
        <PageTitle sub="The Monday read: what last week did, what Sahoda learned from it, and what it plans to do next.">
          CMO Report
        </PageTitle>
        <p className="surface-ring rounded-card bg-surface p-4 type-body text-muted">
          Finish setting up your workspace and your reports appear here.
        </p>
      </div>
    )
  }

  const snapshot = await readLoopSnapshot(workspace.id)
  const cycle = snapshot.cycle

  if (!cycle) {
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
              between {window.fromIso} and {window.toIso}.
            </p>
          ) : (
            <p className="type-body max-w-[68ch] text-muted">
              {cycle.reflectSkippedNoHistory
                ? 'Nothing of yours has been measured yet, so there is nothing to report on last week. This fills in once posts have gone out and the numbers have come back.'
                : 'Fewer than two of your posts were measured last week, so there is no best and worst to name — with one post, the same post is both.'}
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

        {/* ── WHAT IT LEARNED ───────────────────────────────────────────── */}
        <Block eyebrow="The part that changes things" title="What Sahoda learned">
          {learnings.length === 0 ? (
            <p className="type-body max-w-[68ch] text-muted">
              {cycle.reflectSkippedNoHistory
                ? 'Nothing — there was nothing to learn from. No post of yours has been measured, so Sahoda ran no insight pass at all rather than inventing one.'
                : 'Nothing this week. Sahoda read your numbers and found no difference big enough to be worth acting on, which is a real answer and not a failure.'}
            </p>
          ) : (
            <ul className="grid gap-2">
              {learnings.map((learning, index) => (
                <li key={index} className="rounded-input bg-subtle p-3">
                  <p className="type-body text-ink">{learning.summary}</p>
                  <p className="type-sm mt-1 text-muted">
                    {learning.status === 'accepted'
                      ? `You added this to your Brand Brain${learning.appliedVersion !== null ? ` — version ${learning.appliedVersion}` : ''}.`
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
                <li key={brief.id} className="rounded-input bg-subtle p-3">
                  <p className="type-body text-ink">{brief.title}</p>
                  <p className="type-sm mt-1 text-muted">
                    {brief.channels.join(' · ')}
                    {brief.stageOutcome === 'awaiting_approval'
                      ? ' — scheduled, waiting for your approval'
                      : ' — a draft in your Planner'}
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
                Sahoda proposed <span className="num">{cycle.estimatedCredits}</span> credits of
                writing; you approved <span className="num">{cycle.approvedCredits}</span>.
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
