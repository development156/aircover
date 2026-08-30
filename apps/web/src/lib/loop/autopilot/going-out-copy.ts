import type { Channel } from '@sahoda/shared'

/**
 * WHAT TO SAY ABOUT POSTS AUTOPILOT IS ABOUT TO SEND, AND THE THREE NOTHINGS.
 *
 * ── WHY A FUNCTION AND NOT A TERNARY ON THE SCREEN ───────────────────────────
 * An empty list here has three genuinely different meanings and only one of
 * them earns "nothing is waiting". Rendering one sentence for all three would
 * make Sahoda claim something about the reader's setup that no query behind
 * this screen has earned — the same failure `lib/inbox/emptiness.ts` exists to
 * stop, in the same direction.
 *
 *   NO CHANNEL ARMED   Nobody has set a channel to send on its own. Saying
 *                      "nothing is waiting to go out" here implies something
 *                      COULD go out, which is false, and it hides the one
 *                      action that would change the answer.
 *
 *   ARMED, NONE DUE    A channel is armed and there is genuinely nothing in
 *                      the window right now. This is the only state that earns
 *                      a plain "nothing waiting".
 *
 *   SOME WAITING       Posts are in the window. The reader can stop each one,
 *                      and the count is the point.
 *
 * ── WHAT THIS DELIBERATELY DOES NOT SAY ──────────────────────────────────────
 * It never says a post WILL go out. Autopilot hands a post to the publishing
 * path and that path has its own refusals; `dispatched` is not a claim about a
 * platform. So the words are "is set to go out" and "hand it over", never
 * "will be published".
 *
 * It also never promises the window is still open. `dispatchAfter` in the past
 * means the sweep has not reached it yet, and the post may still be stoppable
 * or may already have gone — `stopAutopilotPost` is the only thing that knows,
 * and it answers three outcomes rather than two for exactly this reason.
 */

export type GoingOutState = 'not-armed' | 'armed-idle' | 'waiting' | 'unreadable'

export interface GoingOutView {
  state: GoingOutState
  /** The lead sentence. Always true of the state it describes. */
  sentence: string
  /**
   * What the reader can do about it, or null when there is nothing to offer.
   *
   * Null is a real answer: a reload cannot arm a channel and inventing a
   * remedy that cannot work is the defect `no-impossible-remedy.spec.ts`
   * enforces across this product.
   */
  remedy: string | null
  /** How many posts are in the window. Zero in both empty states. */
  count: number
}

export interface GoingOutInput {
  /** Channels the customer set to send on their own. Empty is the normal case. */
  armed: readonly Channel[]
  /** Posts autopilot has announced and nothing has resolved. */
  waiting: readonly { channel: Channel }[]
}

/**
 * THE FOURTH NOTHING: we could not look.
 *
 * A read that fell over must not render as an empty section and must not render
 * as nothing at all. Hiding the panel is the quieter version of the same lie —
 * the reader is left with a screen that looks exactly like one where autopilot
 * has nothing pending, on the strength of a query that never answered.
 *
 * This was a defect in the first version of the Loop page mount, which returned
 * null for an unreadable read. It was caught by turning the component's own
 * "the panel is present in every state" guard on the page.
 */
export const GOING_OUT_UNREADABLE: GoingOutView = {
  state: 'unreadable',
  sentence: 'Sahoda could not check what is set to go out just now.',
  // Says what is unchanged, because the reader's real question is whether
  // something went out while the screen was blind. Nothing here changed it.
  remedy: 'Try again in a moment. Nothing was sent and nothing was stopped.',
  count: 0,
}

export function goingOutView({ armed, waiting }: GoingOutInput): GoingOutView {
  if (armed.length === 0) {
    return {
      state: 'not-armed',
      // Says what is true of the SETUP, not of the posts. There is no claim
      // here about whether anything would have gone out.
      sentence: 'No channel is set to send on its own.',
      remedy: 'Set a channel to send on its own to let Sahoda schedule posts without you.',
      count: 0,
    }
  }

  if (waiting.length === 0) {
    return {
      state: 'armed-idle',
      sentence: 'Nothing is waiting to go out right now.',
      // Nothing to offer, and offering something would be worse than silence.
      remedy: null,
      count: 0,
    }
  }

  return {
    state: 'waiting',
    sentence:
      waiting.length === 1
        ? 'One post is set to go out.'
        : `${waiting.length} posts are set to go out.`,
    remedy: 'Stop any of them before Sahoda hands it over.',
    count: waiting.length,
  }
}
