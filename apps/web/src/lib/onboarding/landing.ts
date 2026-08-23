import type { OnboardingStatus } from './read-onboarding-state'

/**
 * THE LANDING RULE, as one function with nothing else in it.
 *
 * The decision is separated from the reads so that all five cases can be
 * EXECUTED rather than argued about. A rule that only exists inside an async
 * server layout can be checked by a browser run and by nothing else, and the
 * case that matters most here — `unreadable` must not move anybody — is the
 * hardest of the five to provoke in a browser and the easiest to get wrong.
 *
 * Returns the path to send them to, or `null` for "leave them alone".
 */
export function landingRedirect(
  status: OnboardingStatus,
  hasDeferred: boolean,
): '/onboarding' | null {
  // The customer has already been offered the flow this visit and asked to look
  // around instead. Asked FIRST, so the answer does not depend on the read.
  if (hasDeferred) return null

  switch (status) {
    // Nothing to onboard into. /onboarding is where the create-workspace remedy
    // lives, and it is the case a peer found broken: a workspace-less account on
    // /analytics was told to connect a channel, which it cannot do.
    case 'no-workspace':
      return '/onboarding'
    // Never started, or half way through. The server cannot tell those apart —
    // the resume point is localStorage — and does not need to: same URL, and the
    // stage restores the step on mount.
    case 'not-started':
      return '/onboarding'
    // Done. Nothing offers the flow again.
    case 'completed':
      return null
    /**
     * THE ONE THAT MUST NOT MOVE ANYBODY.
     *
     * A failed read is not a fact about the account. Redirecting on it would
     * walk a customer who finished onboarding weeks ago back to its first screen
     * because one query hiccupped — the "one null, two meanings" defect wearing
     * a redirect instead of a sentence.
     */
    case 'unreadable':
      return null
  }
}
