import { signOutAction } from '@/app/actions/sign-out'

/**
 * THE WAY OUT OF THE PRODUCT, on the one screen that would otherwise have none.
 *
 * ── THE DEAD END THIS CLOSES ─────────────────────────────────────────────────
 * Signing out lives in exactly one place in this app: Clerk's `<UserButton/>` in
 * the topbar, rendered by `(app)/layout.tsx`. An account with no workspace that
 * opens /onboarding directly gets a card which returns BEFORE `OnboardingStage`
 * — so it carries no header, no `Save & exit`, and no user menu either. That is
 * a screen a person can reach and cannot leave. Creating a workspace is the
 * intended remedy and it works, but "the only way out of this product is to use
 * it" is a dead end wearing a primary button.
 *
 * ── A SERVER COMPONENT, AND THAT IS THE POINT ────────────────────────────────
 * The obvious version imports Clerk's `<SignOutButton>`, and MEASURED it takes
 * /onboarding from 779.8 kB to 925.1 kB of first-load JavaScript — the build's
 * own budget failed over it. A form posting to a server action costs nothing,
 * works without JavaScript, and revokes the session at Clerk rather than merely
 * forgetting it here. See `actions/sign-out.ts`.
 *
 * Rendered as quiet text rather than a second button: it is the way out, not the
 * thing to do, and two controls of similar weight would make the choice look
 * balanced when it is not.
 */
export function SignOutLink() {
  return (
    <form action={signOutAction}>
      <button
        type="submit"
        // `type-sm`, not `text-[13px]`. The scale's secondary rung is 13px
        // exactly (`--t-sm: 400 13px/18px`), so this is the same size named
        // rather than written out — which is what docs/37 §3.3 asks for and what
        // `design-lint.mjs` refuses at build time.
        className="type-sm font-[550] text-muted underline-offset-4 hover:text-ink hover:underline"
      >
        Sign out
      </button>
    </form>
  )
}
