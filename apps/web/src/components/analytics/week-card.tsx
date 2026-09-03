import Link from 'next/link'

import { CHANNEL_LABELS } from '@/components/posts/channel-label'
import { normalCopy, rankingCaption, verdictCopy, weekLabel } from '@/lib/analytics/week-copy'
import type { RankedPost, WeekReport } from '@/lib/analytics/week-report'
import { nothingChangedCopy } from '@/lib/analytics/week-copy'

/**
 * ONE WEEK, THE WAY A COLLEAGUE WOULD TELL YOU ABOUT IT.
 *
 * ── THE ORDER IS THE ARGUMENT ────────────────────────────────────────────────
 * Verdict, then evidence, then what Sahoda did about it, then the two posts
 * worth learning from. Every analytics screen in the world runs that list
 * backwards and leaves the reader to work out what it means. This one cannot:
 * the promise is that the owner never opens a dashboard, so the first thing on
 * the card has to be the answer to "was this week any good?".
 *
 * ── EVERY BLOCK CAN REFUSE, AND SAYS WHY IN ITS OWN WORDS ────────────────────
 * None of them apologises and none offers a remedy that cannot work. A verdict
 * with no comparison behind it still gets a sentence, because "we compared your
 * posts and they were close together" is a real answer and "not enough data" is
 * four different facts wearing one coat.
 */
export function WeekCard({ week }: { week: WeekReport }) {
  const verdict = verdictCopy(week.verdict, week.channels)

  return (
    <section
      aria-labelledby={`week-${week.key}`}
      className="space-y-3"
      data-testid={`week-${week.key}`}
    >
      <header className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 id={`week-${week.key}`} className="type-h3 text-ink">
          Week of {weekLabel(week.startsOn, week.endsOn)}
        </h2>
        <p className="type-meta text-muted">
          <span className="tabular-nums">{week.posts}</span> {week.posts === 1 ? 'post' : 'posts'}
          {week.channels.length > 0
            ? ` on ${week.channels.map((channel) => CHANNEL_LABELS[channel] ?? channel).join(', ')}`
            : ''}
        </p>
      </header>

      {/* ── THE VERDICT ─────────────────────────────────────────────────────
          The only element on this card at heading scale, and the only one that
          changes treatment on what it found. A refusal is quiet; a finding is
          the loudest thing in the week. docs/37 §16 allows one focal point per
          view and this is deliberately it. */}
      <div
        className={`surface-ring rounded-card p-5 ${verdict.found ? 'bg-tint-50 dark:bg-s2' : 'bg-surface'}`}
      >
        <p className={`max-w-[46ch] type-h2 ${verdict.found ? 'text-ink' : 'text-body'}`}>
          {verdict.headline}
        </p>
        <p className="mt-2 max-w-[62ch] type-sm text-muted">{verdict.detail}</p>
      </div>

      <div className="grid grid-cols-3 gap-grid max-wide:grid-cols-1">
        {/* The one figure this week can prove, with its label doing real work:
            it is a SUM OF PER-POST REACH and not a count of different people.
            See `WeekReport['total']` for why that distinction is load-bearing. */}
        <div className="surface-ring rounded-card bg-surface p-5">
          <p className="type-meta text-muted">Reach across these posts</p>
          {week.total === null ? (
            <>
              <p className="mt-1 type-hero-num text-muted">—</p>
              <p className="mt-1 type-meta text-muted">Nothing has reported yet.</p>
            </>
          ) : (
            <>
              <p className="mt-1 type-hero-num text-ink">
                {week.total.value.toLocaleString('en-IN')}
              </p>
              <p className="mt-1 type-meta text-muted">
                Added up, so somebody who saw two posts is counted twice.
                {/* CHANNELS, said out loud. The header above counts POSTS and
                    this denominator counts published channels, so one post on
                    two channels reads "1 post" and "1 of 2". Naming the unit is
                    the difference between a coverage note and a contradiction. */}
                {week.total.measured === week.total.of
                  ? ''
                  : ` ${week.total.measured} of ${week.total.of} channels reported.`}
              </p>
            </>
          )}
        </div>

        {/* ── AGAINST THEIR OWN NORMAL ────────────────────────────────────
            One per channel and never mixed: an Instagram week weighed against a
            baseline holding LinkedIn posts would move whenever the channel mix
            moved rather than whenever the work did. */}
        {week.normals.slice(0, 2).map(({ channel, normal }) => {
          const copy = normalCopy(channel, normal)
          return (
            <div key={channel} className="surface-ring rounded-card bg-surface p-5">
              <p className="type-meta text-muted">Against your normal</p>
              <p
                className={`mt-1 max-w-[26ch] type-h3 ${
                  copy.direction === null ? 'text-muted' : 'text-ink'
                }`}
              >
                {copy.headline}
              </p>
              <p className="mt-1 type-meta text-muted">{copy.detail}</p>
            </div>
          )
        })}
      </div>

      <WhatChanged week={week} />

      {week.ranked === null ? null : (
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-grid max-wide:grid-cols-1">
            <RankedCard label="Worked best" post={week.ranked.top} />
            <RankedCard label="Worked least" post={week.ranked.bottom} />
          </div>
          {/* The fairness statement is not a footnote. Without it these are two
              lifetime totals of different ages, which ranks publish dates. */}
          <p className="type-meta text-muted">{rankingCaption(week.ranked)}</p>
        </div>
      )}
    </section>
  )
}

/**
 * WHAT SAHODA CHANGED BECAUSE OF THIS.
 *
 * ── A PLAN IS NOT A CHANGE ───────────────────────────────────────────────────
 * Only briefs that became real posts are listed, because the column that says a
 * brief became a post is the only evidence that anything actually happened. A
 * proposal the Loop never wrote is an intention, and listing it here would be
 * this product taking credit for one.
 *
 * When nothing changed, the reason is stated rather than the section hidden. A
 * section that disappears when the answer is "nothing" teaches a reader that its
 * absence means the feature is broken.
 */
function WhatChanged({ week }: { week: WeekReport }) {
  const changes = week.changes
  const did = changes?.did ?? []

  return (
    <section className="surface-ring rounded-card bg-surface p-5">
      <h3 className="type-h3 text-ink">What Sahoda changed because of this</h3>
      {did.length > 0 ? (
        <ul className="mt-3 space-y-2">
          {did.map((change, index) => (
            <li key={`${change.what}-${index}`} className="type-sm text-body">
              <span className="font-[550]">{change.what}</span>
              {change.why ? <span className="text-muted"> {change.why}</span> : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 max-w-[62ch] type-sm text-muted">
          {/* Three different facts, kept apart. The Loop never ran this week; it
              ran and declined for a reason it recorded; it ran and declined
              before the reason was stored, which is not the same as no reason. */}
          {changes === null
            ? 'Sahoda was not planning your weeks yet, so it changed nothing off the back of this one.'
            : (nothingChangedCopy(changes.nothingReason) ??
              'Sahoda made no change off the back of this week, and did not record why.')}
        </p>
      )}
    </section>
  )
}

/**
 * One end of the ranking.
 *
 * ── WHAT THIS CARD DELIBERATELY DOES NOT SAY ─────────────────────────────────
 * It does not explain WHY a post did well. "A clear offer and a date" is the
 * sentence that would make this teach somebody something, and nothing in this
 * product measures whether a post carried an offer or a date. Writing it anyway
 * would be a claim about a customer's own work with no query behind it, which is
 * the one thing this product may never do. So the card states the two things
 * that are measured: which channel, and the reading both posts were compared at.
 */
function RankedCard({ label, post }: { label: string; post: RankedPost }) {
  return (
    <div className="surface-ring rounded-card bg-surface p-5">
      <p className="type-meta text-muted">{label}</p>
      <Link
        href={`/posts/${post.postId}`}
        className="mt-1 block truncate type-h3 text-ink transition-micro hover:text-accent"
      >
        {post.title}
      </Link>
      <p className="mt-1 type-meta text-muted">
        <span className="tabular-nums">{post.value.toLocaleString('en-IN')}</span> reached on{' '}
        {CHANNEL_LABELS[post.channel] ?? post.channel}
      </p>
    </div>
  )
}
