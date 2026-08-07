/**
 * Who is waiting on whom (SL-062 §1).
 *
 * WHY THIS IS NOT DERIVED FROM `blocked_reason`. A blocked card's reason is a
 * sentence about the WORK ("needs Clerk Restricted mode on, plus TURNSTILE in
 * .env"). It does not say who can unblock it, and several of these blockers are
 * not engineering at all — they are a purchase, a login somebody has to do, or
 * a page somebody has to read. "Blocked" invites the reader to wait; "waiting
 * on DIVAS to sign in once" invites them to act.
 *
 * So this is a RECORDED list, in the same honest-constant style as
 * `alpha-gate.ts`: transcribed by a person on a date, carrying its source, and
 * stale the moment reality moves. `waiting.test.ts` asserts every entry still
 * names a card that exists on the board, so a closed card cannot leave a ghost
 * here — but nothing can check that the NAMED PERSON is still the right one.
 * Re-read it whenever a blocker changes hands.
 *
 * WHEN A CARD CLOSES, DELETE ITS ENTRY. An entry left behind asserts somebody
 * is holding something up when they are not, which is worse than saying nothing.
 */

export interface WaitingOn {
  /** The board card this is about. Must exist on the board. */
  code: string
  /** The person or the decision. Never a team, never "someone". */
  who: string
  /** The single next action that would unblock it, in one line. */
  action: string
  /** ISO date this has been waiting since. */
  since: string
}

/** Transcribed 2026-08-01 from the cards' own details. */
export const WAITING_ON: readonly WaitingOn[] = [
  {
    code: 'SL-040',
    who: 'DIVAS',
    action:
      'Turn on invite-only signup and put the two form secrets in the environment file, then walk the eight-step click-through.',
    since: '2026-07-27',
  },
  {
    code: 'SL-043',
    who: 'DIVAS — a decision, not engineering',
    action:
      'Approve creating a second, separate database for testing. It was measured at no monthly cost; the work is a day once approved.',
    since: '2026-07-30',
  },
  {
    code: 'SL-054',
    who: 'DIVAS',
    action:
      'Sign in to the live product once and confirm it works, so the outage card can close on evidence rather than on our own probes.',
    since: '2026-07-31',
  },
  {
    code: 'SL-057',
    who: 'DIVAS — a decision',
    action:
      'Decide whether the code repository stays public. No credentials are exposed, so this is a preference, not an incident.',
    since: '2026-07-31',
  },
  {
    code: 'SL-058',
    who: 'Anyone with hosting access',
    action:
      "Open the hosting project's Git settings page and read which branch is set as production. Two minutes; nobody has done it.",
    since: '2026-07-31',
  },
]
