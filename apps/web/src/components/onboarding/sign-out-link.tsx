'use client'

import { SignOutButton } from '@clerk/nextjs'

/**
 * THE WAY OUT OF THE PRODUCT, on the one screen that would otherwise have none.
 *
 * ── THE DEAD END THIS CLOSES ─────────────────────────────────────────────────
 * Signing out lives in exactly one place in this app: Clerk's `<UserButton/>` in
 * the topbar, and the topbar is rendered by `(app)/layout.tsx`. The landing rule
 * in that same layout sends an account with NO WORKSPACE to /onboarding, and
 * /onboarding answers that state with a card that returns before
 * `OnboardingStage` — so it carries no header, no `Save & exit`, and no user
 * menu either.
 *
 * Put together, that is an account which can reach exactly one screen and cannot
 * leave it. Creating a workspace is the intended remedy and it works, but "the
 * only way out of this product is to use it" is a dead end wearing a primary
 * button. Signing out has to be reachable from anywhere a person can be stranded.
 *
 * Rendered as quiet text rather than a second button: it is the way out, not the
 * thing to do, and two buttons of similar weight would make the choice look
 * balanced when it is not.
 */
export function SignOutLink() {
  return (
    <SignOutButton redirectUrl="/sign-in">
      <button
        type="button"
        className="text-[13px] font-[550] text-muted underline-offset-4 hover:text-ink hover:underline"
      >
        Sign out
      </button>
    </SignOutButton>
  )
}
