import type { OnboardingStatus } from './read-onboarding-state'

/**
 * THE LANDING RULE, as one function with nothing else in it.
 *
 * The decision is separated from the reads so that all its cases can be
 * EXECUTED rather than argued about. A rule that only exists inside an async
 * server layout can be checked by a browser run and by nothing else, and the
 * case that matters most here — `unreadable` must not move anybody — is the
 * hardest to provoke in a browser and the easiest to get wrong.
 *
 * ── THREE OUTCOMES, AND THE MIDDLE ONE IS NOT A REDIRECT ────────────────────
 * An account with NO WORKSPACE is not sent anywhere. It is shown the first-run
 * screen WHERE IT STANDS, and the difference is not stylistic:
 *
 *  · There is no workspace-less URL to send them to. /home is inside the same
 *    layout that would be doing the redirecting, so `no-workspace` → /home is a
 *    loop unless the layout also knows the current path — which a server layout
 *    does not, and buying it means putting a header into `middleware.ts`.
 *  · Replacing the content is STRICTLY more certain than moving them. A
 *    redirect fixes the pages you remembered to leave; this covers every route
 *    under `(app)` including ones not written yet, at whatever URL was typed.
 *  · And it is what /home already did — `if (balance.status === 'no-workspace')
 *    return <FirstRun/>` — lifted from one page to all of them. The peer's
 *    finding was /analytics telling a workspace-less account to connect a
 *    channel; that page cannot say it any more, because it does not render.
 *
 * The shell stays around it, which is the other half of not being a dead end:
 * the topbar's user menu is where signing out lives.
 */
export type LandingDecision =
  /** Render the page they asked for. */
  | { kind: 'through' }
  /** Send them into the flow. Only ever /onboarding, which is outside `(app)`. */
  | { kind: 'redirect'; to: '/onboarding' }
  /** Replace the page with the first-run screen, at whatever URL they are on. */
  | { kind: 'first-run' }

export function landingDecision(status: OnboardingStatus, hasDeferred: boolean): LandingDecision {
  switch (status) {
    /**
     * NOT DEFERRABLE, and that is deliberate. `Save & exit` is a statement about
     * onboarding, not about the missing workspace underneath it, and there is
     * no dashboard to defer TO: every read on every page short-circuits on a
     * null workspace, so honouring the cookie here would hand back the grid of
     * empty cards this replaces.
     */
    case 'no-workspace':
      return { kind: 'first-run' }

    /**
     * Never started, or half way through. The server cannot tell those apart —
     * the resume point is localStorage — and does not need to: same URL, and
     * the stage restores the step on mount.
     *
     * The ONE case the deferral applies to. wt-onboard2 built `Save & exit`; a
     * gate that bounced it straight back would have deleted that feature while
     * every test of the button still passed, because it would still save and
     * still navigate and simply arrive nowhere.
     */
    case 'not-started':
      return hasDeferred ? { kind: 'through' } : { kind: 'redirect', to: '/onboarding' }

    /** Done. Nothing offers the flow again. */
    case 'completed':
      return { kind: 'through' }

    /**
     * THE ONE THAT MUST NOT MOVE ANYBODY.
     *
     * A failed read is not a fact about the account. Acting on it would walk a
     * customer who finished onboarding weeks ago back to its first screen, or
     * tell a founder with three workspaces to create one — the "one null, two
     * meanings" defect wearing a redirect instead of a sentence. They get the
     * page they asked for, and its own honest-absence states do their job.
     */
    case 'unreadable':
      return { kind: 'through' }
  }
}
