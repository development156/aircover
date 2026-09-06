import Link from 'next/link'

import type { LoopSnapshot } from '@/lib/loop/read'
import { reflectSentence } from '@/lib/loop/reflect'

/**
 * Where the current cycle got to, in sentences.
 *
 * ── THE REFLECT LINE IS THREE DIFFERENT SENTENCES ────────────────────────────
 * "Sahoda had nothing to reflect on" and "Sahoda reflected and found nothing
 * worth saying" are different claims, and only one of them is an admission that
 * the product has no history yet. `reflect_skipped_no_history` is a stored
 * column precisely so this line is a lookup rather than an inference.
 *
 * It sits INSIDE the controls panel now rather than in a card of its own. The
 * card was the same shape as the panel above it and said, by that shape, that
 * these were two unrelated things; they are the same thing — what the Loop is
 * doing, and the controls for it.
 */
export function CycleSummary({
  cycle,
  briefCount,
}: {
  cycle: NonNullable<LoopSnapshot['cycle']>
  briefCount: number
}) {
  const failed = cycle.status === 'failed'
  const cancelled = cycle.status === 'cancelled'

  return (
    <div className="border-t border-line-soft pt-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        {/* `already_planned`'s remedy links here by id. Deleting it made
            "Review this week" scroll nowhere — a remedy that cannot work. */}
        <h3 id="loop-current" className="type-h3 text-ink">
          {cancelled
            ? 'This week was stopped'
            : failed
              ? 'This week did not run'
              : cycle.status === 'reported'
                ? 'This week is done'
                : 'This week is running'}
        </h3>
        <p className="type-sm num text-muted">
          Week {cycle.isoWeek}, {cycle.isoYear}
        </p>
      </div>

      {failed && cycle.failureReason === 'CHANNELS_UNREADABLE' ? (
        <p className="type-body mt-1 max-w-[68ch] text-muted">
          Sahoda couldn’t check which channels you have connected, so it stopped rather than
          planning for the wrong ones. Nothing was charged. Run it again.
        </p>
      ) : failed && cycle.failureReason === 'NO_CHANNELS' ? (
        <p className="type-body mt-1 max-w-[68ch] text-muted">
          Sahoda has nowhere to plan for.{' '}
          <Link href="/connections" className="font-[550] text-accent underline underline-offset-2">
            Connect a channel
          </Link>{' '}
          and run it again. Nothing was charged.
        </p>
      ) : failed ? (
        <p className="type-body mt-1 max-w-[68ch] text-muted">
          Sahoda could not finish planning this week, and you were not charged for the part that
          failed.
        </p>
      ) : cancelled ? (
        <p className="type-body mt-1 max-w-[68ch] text-muted">
          You stopped this cycle. Anything it had written is still in your Planner.
        </p>
      ) : (
        <p className="type-body mt-1 max-w-[68ch] text-muted">
          Sahoda planned <span className="num">{briefCount}</span>{' '}
          {briefCount === 1 ? 'post' : 'posts'} for this week.
        </p>
      )}

      {!failed && !cancelled ? (
        <p className="type-sm mt-2 max-w-[68ch] text-muted">
          {/*
            The stored reason first, because it is the specific one. The
            boolean is the fallback for cycles that ran before `reflect_reason`
            existed, and the last sentence is for a cycle that DID produce a
            learning — three different facts, and the screen used to have two
            sentences for all three.
          */}
          {reflectSentence(cycle.reflectReason) ??
            (cycle.reflectSkippedNoHistory
              ? 'It had nothing to reflect on. No post of yours has been measured yet, so there was nothing to learn from.'
              : 'It read last week’s numbers before planning.')}
        </p>
      ) : null}

      {cycle.status === 'reported' ? (
        <p className="type-sm mt-3">
          <Link href="/report" className="font-[550] text-accent underline underline-offset-2">
            Read the report for this week
          </Link>
        </p>
      ) : null}
    </div>
  )
}
