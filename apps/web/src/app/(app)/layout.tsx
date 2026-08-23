import { redirect } from 'next/navigation'
import { Toaster } from 'sonner'

import { hasDeferredOnboarding } from '@/lib/onboarding/defer'
import { landingRedirect } from '@/lib/onboarding/landing'
import { onboardingStateRead } from '@/lib/onboarding/read-onboarding-state'
import { activeWorkspaceRead } from '@/lib/workspaces'

import { BottomNav } from '@/components/shell/bottom-nav'
import { Rail } from '@/components/shell/rail'
import { Topbar } from '@/components/shell/topbar'

/**
 * THE LANDING RULE — a new user lands in onboarding, not on the dashboard.
 *
 * ── WHERE IT LIVES, AND WHY HERE ─────────────────────────────────────────────
 * Every authenticated page of the product is inside `(app)`, and this layout is
 * the one thing all of them pass through. `middleware.ts` was the other
 * candidate and is the wrong one twice over: it decides whether a caller is
 * SIGNED IN, which is a different question, and it runs on the edge, where
 * answering "does this workspace have a Brand Brain" means a database round trip
 * on every request for a static asset that slipped the matcher.
 *
 * ── WHAT IT IS NOT ───────────────────────────────────────────────────────────
 * This is a LANDING rule, not access control, and the distinction is worth
 * stating because the code cannot: React re-uses a layout across a client-side
 * navigation between two routes that share it, so this runs on the load that
 * MOUNTS the shell — a sign-in, a typed URL, a refresh, a full-page redirect —
 * and not on every `<Link>` press afterwards. That is exactly the behaviour the
 * ruling asks for. It is not a wall, and nothing here should ever be relied on
 * as one: `auth.protect()` in middleware and RLS in the database are what decide
 * who may see what, and both are untouched.
 *
 * ── THE FOUR CASES ───────────────────────────────────────────────────────────
 *   never onboarded  → /onboarding. First screen of the product.
 *   mid-way          → /onboarding, and the stage restores the step they left
 *                      from localStorage on mount. The server cannot tell these
 *                      two apart and does not need to: same URL, different
 *                      screen, decided by the browser that holds the answer.
 *   completed        → straight through. Nothing sends them back into the flow.
 *   no workspace     → /onboarding, which is where the create-workspace remedy
 *                      lives. This is the case a peer found broken: a
 *                      workspace-less account reading /analytics was told to
 *                      connect a channel, an instruction it cannot carry out.
 *                      Every such page is now unreachable in that state rather
 *                      than individually re-worded.
 *
 * And a fifth that is deliberately NOT a case: `unreadable`. A failed read is
 * not a fact about the account, and moving somebody on it would be the "one
 * null, two meanings" defect wearing a redirect. They stay where they are and
 * the page's own honest-absence states do their job.
 *
 * ── THE ESCAPE HATCH IS THE PRODUCT'S OWN BUTTON ─────────────────────────────
 * `Save & exit` calls `deferOnboarding()`, which sets a SESSION cookie, and this
 * gate stands down while it is set. Without that the button would push /home,
 * this would bounce it back to /onboarding, and wt-onboard2's feature would be
 * gone. The cookie dies with the browser session, so the next sign-in lands them
 * in the flow again — which is the ruling, not a loophole in it.
 */
async function routeNewAccountsToOnboarding(): Promise<void> {
  // Cheap and local; asked first so a visit that has already deferred costs no
  // query at all.
  const deferred = await hasDeferredOnboarding()
  if (deferred) return

  const state = await onboardingStateRead()
  // The decision itself is `lib/onboarding/landing.ts` — a pure function, so
  // every one of its five cases is executed by a test rather than only by a
  // browser. This file is the wiring.
  const target = landingRedirect(state.status, deferred)
  if (target) redirect(target)
}

/**
 * The app shell, in two mutually exclusive forms (SPECIFICATION.md §10).
 *
 * ≥768px  rail + topbar. The rail collapses to 64px icons at ≤1180px.
 * <768px  NO rail at all — bottom navigation with a dominant `+`.
 *
 * Mobile is RECOMPOSED, not shrunk. `max-narrow:hidden` on the rail is the
 * load-bearing half of that: without it the phone gets a 64px icon strip eating
 * a sixth of a 390px viewport, which is a squeezed desktop layout rather than
 * the mobile design.
 *
 * The `pb-[76px]` on <main> reserves the bottom bar's height plus breathing
 * room, because the bar is `fixed` and would otherwise sit on top of the last
 * row of every page — the classic version of this bug hides exactly one
 * control, the one at the end of the list, on exactly one device.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  await routeNewAccountsToOnboarding()

  /**
   * Only the phone's FAB needs this, and only to decide whether to paint the
   * loudest control on a 390px screen.
   *
   * `activeWorkspaceRead` is the React-cached read, so a second consumer costs
   * nothing, and it is the THREE-WAY one on purpose: 'none' is a fact about the
   * account and 'unreadable' is a question that did not get an answer. Only the
   * first may change what is rendered.
   */
  const workspace = await activeWorkspaceRead()

  return (
    <div className="grid min-h-dvh grid-cols-[auto_1fr] max-narrow:grid-cols-1">
      {/* THE GRADIENT GROUND — fixed, behind everything, out of every hit-test.
          It is `aria-hidden` and empty because it carries no information: a
          decorative layer that a screen reader announces is noise, and one that
          intercepts a click is a bug that only shows up on a phone.

          It lives HERE rather than in the root layout on purpose. /sign-in and
          /onboarding compose their own grounds, and a second fixed layer under
          them would fight the one they already paint. */}
      <div aria-hidden className="grad-ground" />
      <div className="max-narrow:hidden">
        <Rail />
      </div>
      <div className="flex min-w-0 flex-col">
        <Topbar />
        <main
          id="main"
          className="mx-auto w-full max-w-content p-page max-narrow:p-page-mobile max-narrow:pb-[76px]"
        >
          {children}
        </main>
      </div>
      <BottomNav hasWorkspace={workspace.status !== 'none'} />
      {/* Lifted clear of the bottom bar on a phone, or it covers the tabs. */}
      <Toaster position="bottom-left" offset={{ bottom: 16 }} mobileOffset={{ bottom: 72 }} />
    </div>
  )
}
