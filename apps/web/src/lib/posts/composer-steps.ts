/**
 * The composer in three steps, and what it takes to reach each one.
 *
 * ── THIS REVERSES A RECORDED DECISION, DELIBERATELY ──────────────────────────
 * `composer-header.tsx` carried a heading that read "THE CHANNEL ROW IS AT THE
 * TOP AND IT IS NEVER A STEP", arguing that the deleted five-step wizard made
 * changing your mind halfway through writing into a navigation. Founder's
 * ruling, 2026-08-28: the screen is a sequence again — write, then choose where
 * it goes, then send it — and a writer may not jump ahead.
 *
 * The half of that old argument worth keeping is kept. This is NOT a wizard:
 * there are no pages, nothing is hidden, and once a step is reachable it stays
 * reachable. Changing your mind is still a scroll, never a navigation. What
 * changed is only that a step you have not earned yet is inert and says why.
 *
 * ── LOCKED MEANS VISIBLE AND REFUSED, NEVER ABSENT ───────────────────────────
 * A hidden section is a question the reader cannot ask. Every step is on the
 * screen from the first paint; an unreachable one is dimmed, cannot be operated,
 * and carries the sentence that says what to do about it. `no-impossible-remedy`
 * is the rule this follows: never offer an action that cannot work, and never
 * leave someone without one that can.
 *
 * ── AND A STEP NEVER TAKES BACK WHAT IT ALREADY HOLDS ────────────────────────
 * The gate is on the OFFER, not on the content. A post that already names three
 * channels keeps them reachable even if its body is emptied, because taking a
 * choice away from someone who already made it is a different act from declining
 * to offer it yet — and this lane has now made that mistake twice in one day, on
 * /connections and in the channel picker. The third time it is a rule.
 */

export type StepAccess = 'open' | 'locked'

export interface ComposerStep {
  access: StepAccess
  /**
   * Why it is locked, and what to do about it. Null when open.
   *
   * A sentence rather than a flag, because the sentence is the whole remedy: a
   * dimmed panel with no words is indistinguishable from a broken one.
   */
  reason: string | null
}

export interface ComposerStepsInput {
  /** The canonical post body, exactly as typed. */
  body: string
  /** Channels currently chosen for the post. */
  channels: readonly string[]
}

export interface ComposerSteps {
  /** Step one. Always open — it is the thing every other step waits on. */
  write: ComposerStep
  /** Step two: where it goes, and each channel's own version. */
  channels: ComposerStep
  /** Step three: schedule it, or send it now. */
  send: ComposerStep
}

/** Has anything actually been written? Whitespace is not a post. */
export function hasWriting(body: string): boolean {
  return body.trim().length > 0
}

export function composerSteps({ body, channels }: ComposerStepsInput): ComposerSteps {
  const written = hasWriting(body)
  const picked = channels.length > 0

  // Open on its own prerequisite OR on what it already holds. See the header.
  const channelsOpen = written || picked
  // Just `picked`, and deliberately not `channelsOpen && picked`: a post with a
  // channel on it has already opened step two by the line above, so the extra
  // conjunct can never change the answer. A condition no input can falsify is a
  // branch no test can cover, and it reads as a rule that is really a comment.
  const sendOpen = picked

  return {
    write: { access: 'open', reason: null },
    channels: {
      access: channelsOpen ? 'open' : 'locked',
      // Says what is missing AND why it is needed, because "write something
      // first" alone reads as an arbitrary order rather than a dependency.
      reason: channelsOpen
        ? null
        : 'Write your post first. Sahoda shapes a version for each channel from what you write, so there is nothing to shape yet.',
    },
    send: {
      access: sendOpen ? 'open' : 'locked',
      // Two different nothings, and they are not interchangeable: one of them
      // is answered two sections up, the other one section up.
      reason: sendOpen
        ? null
        : channelsOpen
          ? 'Pick at least one channel first. Nothing can go out until Sahoda knows where it is going.'
          : 'Write your post first, then pick where it goes.',
    },
  }
}

/** Which steps have already been reachable at some point in this sitting. */
export interface StepsReached {
  channels: boolean
  send: boolean
}

/**
 * A DOOR THAT HAS OPENED ONCE DOES NOT SHUT UNDER THE CURSOR.
 *
 * `composerSteps` reads the post as it stands, which is right for a post being
 * opened and wrong for a post being edited: empty the body of a one-channel
 * draft and untick that channel, and step two locks with the pointer still
 * inside it. Nothing was refused there — a person was in the middle of changing
 * their mind, which is the one moment a sequence must not become a trap.
 *
 * So reachability only ever grows within a sitting. A reload starts the rules
 * again from the post, which is correct: at that point the post really does say
 * nothing, and the sequence should say so from the first paint.
 */
export function keepWhatWasReached(steps: ComposerSteps, reached: StepsReached): ComposerSteps {
  const open: ComposerStep = { access: 'open', reason: null }

  return {
    write: steps.write,
    channels: reached.channels ? open : steps.channels,
    send: reached.send ? open : steps.send,
  }
}

/** The latch itself: what was reachable before, plus what is reachable now. */
export function reachedAfter(reached: StepsReached, steps: ComposerSteps): StepsReached {
  return {
    channels: reached.channels || steps.channels.access === 'open',
    send: reached.send || steps.send.access === 'open',
  }
}
