import Link from 'next/link'

import { CHANNEL_LABELS } from '@/components/posts/channel-label'
import { byChannel } from '@/lib/analytics/rows'
import type { PublishedRow } from '@/lib/analytics/window-data'

/**
 * WHERE THIS BUSINESS ACTUALLY GETS TRACTION.
 *
 * ── ONE CARD PER CHANNEL, ORDERED BY REACH ───────────────────────────────────
 * And a channel with nothing measured sorts LAST rather than as a zero, which is
 * the same refusal the table's ordering makes: a channel the platform has not
 * reported on, placed at the bottom of a list ordered by reach, has been called
 * the worst channel without a zero ever being drawn.
 *
 * ── THE SUMMARY LINE IS ARITHMETIC, NOT A JUDGEMENT ──────────────────────────
 * "Instagram brings you four times the reach LinkedIn does" is a division of two
 * figures on this screen, and it is printed only when both are present and the
 * gap is large enough to be worth a sentence. It deliberately does NOT say which
 * channel to use: that is a recommendation, recommendations belong on the CMO
 * Report, and this page is the evidence.
 */

/** How much bigger the leader must be before the comparison is worth stating. */
const MIN_MULTIPLE = 1.5

export function ChannelCards({
  rows,
  ageDays,
}: {
  rows: readonly PublishedRow[]
  ageDays: number | null
}) {
  const rollups = byChannel(rows)
  if (rollups.length === 0) return null

  return (
    <section aria-labelledby="by-channel" className="space-y-3">
      <h2 id="by-channel" className="type-h3 text-ink">
        By channel
      </h2>

      <div className="grid grid-cols-3 gap-grid max-wide:grid-cols-2 max-narrow:grid-cols-1">
        {rollups.map((rollup) => (
          <article key={rollup.channel} className="surface-ring rounded-card bg-surface p-5">
            <h3 className="type-eyebrow text-muted">
              {CHANNEL_LABELS[rollup.channel] ?? rollup.channel}
            </h3>
            <p className="mt-3 type-hero-num text-ink">
              {rollup.reach === null ? (
                <span className="text-muted">—</span>
              ) : (
                rollup.reach.toLocaleString('en-IN')
              )}
            </p>
            <p className="mt-1 type-meta text-muted">
              {rollup.reach === null
                ? 'Nothing reported on this channel yet.'
                : 'People reached, added up across these posts.'}
            </p>
            <p className="mt-2 type-meta text-muted">
              <span className="tabular-nums">{rollup.posts}</span>{' '}
              {rollup.posts === 1 ? 'post' : 'posts'}
              {/* The denominator is stated whenever it is not everything. A sum
                  from two of nine posts is a subtotal, and a card that hides
                  that is the same defect as a total that skipped its gaps. */}
              {rollup.reach !== null && rollup.measured < rollup.posts
                ? `, ${rollup.measured} measured`
                : ''}
            </p>
            {rollup.best ? (
              <p className="mt-3 type-meta text-muted">
                Furthest:{' '}
                <Link
                  href={`/posts/${rollup.best.postId}`}
                  className="text-body transition-micro hover:text-accent"
                >
                  {rollup.best.title}
                </Link>
              </p>
            ) : null}
          </article>
        ))}
      </div>

      {comparison(rollups, ageDays)}
    </section>
  )
}

/**
 * One sentence comparing the top two, or nothing at all.
 *
 * Nothing, rather than a hedge. "We could not compare your channels" invites the
 * reader to think there is a comparison and we are withholding it, when the true
 * statement is that the two figures are close enough that the difference is not
 * a fact about their business.
 */
function comparison(
  rollups: ReturnType<typeof byChannel>,
  ageDays: number | null,
): React.ReactNode {
  const [leader, runnerUp] = rollups
  if (!leader || !runnerUp) return null
  if (leader.reach === null || runnerUp.reach === null || runnerUp.reach <= 0) return null

  const multiple = leader.reach / runnerUp.reach
  if (multiple < MIN_MULTIPLE) return null

  const leaderName = CHANNEL_LABELS[leader.channel] ?? leader.channel
  const runnerName = CHANNEL_LABELS[runnerUp.channel] ?? runnerUp.channel

  return (
    <p className="max-w-[62ch] type-sm text-body">
      {leaderName} reached {multiple.toFixed(1).replace(/\.0$/, '')} times as many people as{' '}
      {runnerName} in this period
      {ageDays === null ? '' : `, comparing every post ${ageDays} days after it went out`}.
    </p>
  )
}
