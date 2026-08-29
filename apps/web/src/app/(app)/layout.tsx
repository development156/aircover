import { Toaster } from 'sonner'

import { hasDeferredOnboarding } from '@/lib/onboarding/defer'
import { landingDecision } from '@/lib/onboarding/landing'
import { onboardingStateRead } from '@/lib/onboarding/read-onboarding-state'
import { activeThemeTokens } from '@/lib/brand/read-theme'
import { skinCss } from '@/lib/brand/skin-css'
import { activeWorkspaceRead } from '@/lib/workspaces'

import { FirstRun } from '@/components/home/first-run'
import { BottomNav } from '@/components/shell/bottom-nav'
import { Rail } from '@/components/shell/rail'
import { Topbar } from '@/components/shell/topbar'

/**
 * NO WORKSPACE — THE FIRST-RUN SCREEN, EVERYWHERE, IN PLACE OF THE PAGE.
 *
 * ── THE DEAD END THIS CLOSES ─────────────────────────────────────────────────
 * Every read on every route under `(app)` short-circuits on a null workspace, so
 * what these pages render for such an account is a grid of empty cards offering
 * remedies it cannot carry out. A peer found the sharp version: /analytics told
 * a workspace-less account to connect a channel. /home and /wallet had each
 * already fixed their own copy of this; fixing the rest one page at a time is
 * how the next new route inherits it.
 *
 * ── WHY REPLACE AND NOT REDIRECT ─────────────────────────────────────────────
 * There is no workspace-less URL to send them to — /home is inside this same
 * layout, so a redirect to it loops unless the layout also knows the current
 * path, which a server layout does not. Replacing the content is also strictly
 * MORE certain: it covers every route in the group including ones not written
 * yet, at whatever URL was typed. See `lib/onboarding/landing.ts`.
 *
 * The shell stays around it, and that is the other half of not being a dead
 * end: the topbar's user menu is where signing out lives.
 *
 * ── WHAT IS NOT HERE ─────────────────────────────────────────────────────────
 * The other half of the ruling — a new user LANDS in onboarding — is in
 * `home/page.tsx`, because /home is where landing happens: Clerk returns to `/`
 * after sign-in and `/` redirects there. Putting it in this layout would bounce
 * every typed URL and every refresh, which is more than the ruling asks and is
 * not what "lands" means.
 */
async function decideLanding(): Promise<'through' | 'first-run'> {
  const [deferred, state] = await Promise.all([hasDeferredOnboarding(), onboardingStateRead()])
  // The decision is `lib/onboarding/landing.ts` — pure, so every one of its
  // eight combinations is executed by a test rather than only by a browser.
  return landingDecision(state.status, deferred).kind === 'first-run' ? 'first-run' : 'through'
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
  /**
   * Only the phone's FAB needs this, and only to decide whether to paint the
   * loudest control on a 390px screen.
   *
   * `activeWorkspaceRead` is the React-cached read, so a second consumer costs
   * nothing, and it is the THREE-WAY one on purpose: 'none' is a fact about the
   * account and 'unreadable' is a question that did not get an answer. Only the
   * first may change what is rendered.
   */
  const landing = await decideLanding()

  /**
   * BRAND SKIN, APPLIED. Everything below this line existed and nothing called
   * it: a workspace could upload a logo, have its colours extracted, guarded,
   * derived and stored, and watch the product stay Sahoda orange for ever.
   *
   * Read HERE, on the server, in the same pass that renders the page. Setting
   * these from an effect would paint our orange first and the customer's brand a
   * frame later, which is the flash `docs/26` forbids. A workspace with no theme
   * produces an empty string and `tokens.css` stands untouched.
   *
   * The read is scoped to the CURRENT workspace and not to the account: RLS
   * confines it to the caller's memberships, which for somebody in two
   * workspaces is not the same thing, and an unfiltered read would paint one
   * workspace in the other's brand. `read-theme.ts` records that exact defect
   * happening on /sites.
   */
  const workspace = await activeWorkspaceRead()

  const skin =
    workspace.status === 'ok' ? skinCss(await activeThemeTokens(workspace.workspace.id)) : ''

  return (
    <div className="grid min-h-dvh grid-cols-[auto_1fr] max-narrow:grid-cols-1">
      {/* A workspace with no theme emits no element at all, so the default
          palette is the absence of this rather than a second rule overriding
          the first. */}
      {skin ? <style data-brand-skin="">{skin}</style> : null}
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
          {/* THE PAGE IS REPLACED, NOT DEGRADED. An account with no workspace
              has nothing any of these routes can read — every one of them
              short-circuits on a null workspace — so what they would render is
              a grid of empty cards with remedies that cannot be carried out.
              `id="main"` stays on the wrapper, so the bootstrap button keeps
              the one selector this app's tests and its skip link both use. */}
          {landing === 'first-run' ? <FirstRun now={new Date()} /> : children}
        </main>
      </div>
      <BottomNav hasWorkspace={workspace.status !== 'none'} />
      {/* Lifted clear of the bottom bar on a phone, or it covers the tabs. */}
      <Toaster position="bottom-left" offset={{ bottom: 16 }} mobileOffset={{ bottom: 72 }} />
    </div>
  )
}
