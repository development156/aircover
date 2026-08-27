'use client'

import { ChannelMark } from '@/components/posts/channel-mark'
import { CHANNEL_LABELS } from '@/components/posts/channel-label'
import { LiveLink } from '@/components/posts/live-link'
import { cn } from '@/lib/utils'
import type { PublishOutcome } from '@/lib/posts/publish-one'

export interface SendOutcomesProps {
  outcomes: readonly PublishOutcome[]
}

/**
 * WHAT HAPPENED, PER CHANNEL, NEVER SUMMED.
 *
 * ── THE WHOLE REASON A SINGLE SEND BUTTON IS ALLOWED TO EXIST ────────────────
 * One post can be live on Instagram and refused by X in the same second. That
 * fact is why this panel resisted a single "Send now" for so long — a lone
 * verdict over four accounts is a lie in at least one direction, and "Published"
 * over a post that half worked is exactly the false certainty this surface was
 * built to prevent.
 *
 * The button is fine. The BANNER was the problem. So the press is one press and
 * the answer is a list: one row per channel, each carrying its own verdict and
 * its own link, and no sentence anywhere that adds them up.
 *
 * ── A SUCCESS WITHOUT A LINK IS NOT RENDERED HERE AT ALL ─────────────────────
 * `publishOne` turns a permalink-less 201 into a FAILURE row with an exact
 * sentence, so there is no branch below for "live, but we cannot show you
 * where". A success row always has somewhere to go.
 *
 * ── THE LINK IS `LiveLink`, NOT A HAND-ROLLED ANCHOR ─────────────────────────
 * The first draft of this file copied the old markup out of `PublishNow`, which
 * put `.is-real` and `text-ok` on the same element. `.is-real` is a CERTAINTY
 * CHIP style — `background: var(--brand)` with `--brand-ink` on it — so the two
 * fought and the result was an accidental orange pill with a stolen text colour,
 * sitting inside a card that had already said "Live on Instagram".
 *
 * `LiveLink` is the component that was already right, and it carries a guard the
 * copy did not: a `fixture://` permalink is a simulation marker, never a
 * destination, and it renders nothing rather than offering a page that does not
 * exist.
 */
export function SendOutcomes({ outcomes }: SendOutcomesProps) {
  if (outcomes.length === 0) return null

  return (
    <ul className="space-y-2" data-send-outcomes>
      {outcomes.map((outcome) => (
        <li
          key={outcome.channel}
          data-send-outcome={outcome.channel}
          data-send-outcome-ok={outcome.ok ? 'yes' : 'no'}
          className={cn(
            'space-y-1.5 rounded-input border p-3',
            outcome.ok ? 'border-ok bg-ok-bg' : 'border-warn bg-warn-bg',
          )}
        >
          <p
            className={cn(
              'type-eyebrow flex items-center gap-2',
              outcome.ok ? 'text-ok' : 'text-warn',
            )}
          >
            <ChannelMark channel={outcome.channel} size={15} />
            {outcome.ok
              ? outcome.alreadyPublished
                ? `Already live on ${CHANNEL_LABELS[outcome.channel]}`
                : `Live on ${CHANNEL_LABELS[outcome.channel]}`
              : `Not sent to ${CHANNEL_LABELS[outcome.channel]}`}
          </p>

          {outcome.ok ? (
            <LiveLink channel={outcome.channel} permalink={outcome.permalink} />
          ) : (
            <p className="type-sm text-warn">{outcome.message}</p>
          )}
        </li>
      ))}
    </ul>
  )
}
