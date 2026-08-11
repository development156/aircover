import { Sparkles } from 'lucide-react'

import { EmptyState } from '@/components/empty-state'
import { CreateWorkspaceButton } from '@/components/workspace/create-workspace-button'
import { greetingFor } from '@/lib/home/greeting'

export interface FirstRunProps {
  /** Read once on the server, like the rest of Home, so the greeting cannot drift. */
  now: Date
}

/**
 * Home for a signed-in user who has no workspace yet.
 *
 * Signing up does not create one — `bootstrap_workspace` runs only when the user
 * asks for it, and the signup credit grant is written inside that same function.
 * So this is the FIRST screen of the product for every new account, and until now
 * it rendered the full dashboard with an em dash where the balance goes and
 * "credits to spend" underneath: a number that reads as broken, next to a claim
 * about credits that do not exist yet.
 *
 * The dashboard is not degraded here, it is replaced. `/wallet` already made this
 * choice for the same reason (`wallet/page.tsx`, the `no-workspace` branch) — an
 * empty dashboard invites the user to press things that cannot work, and every
 * one of them fails with "create a workspace first".
 *
 * The greeting stays because it is TRUE — the hour of the day is not a claim about
 * their data. The state sentence underneath is replaced: `greetingState` would say
 * "Nothing in flight yet — plan a week and it starts filling in", and planning a
 * week is exactly what this user cannot do.
 *
 * No credit figure appears in the tip. The grant is `plans.monthly_credits` read
 * server-side at bootstrap, this page never read it, and a hardcoded number here
 * would be a claim the screen cannot support — the same rule the balance card
 * follows one branch over.
 */
export function FirstRun({ now }: FirstRunProps) {
  return (
    <div className="space-y-8">
      <header className="space-y-1">
        <h1 className="type-display">{greetingFor(now)}</h1>
        <p className="text-[15px] text-ink-mute">
          Create a workspace and Sahoda starts filling this in.
        </p>
      </header>

      <EmptyState
        icon={Sparkles}
        title="Create a workspace to get started"
        body="Everything in Sahoda lives in a workspace — your Brand Brain, your posts and your credits. Nothing has failed and nothing was charged; there is simply nothing to show until one exists."
        action={<CreateWorkspaceButton variant="primary" guideAnchor="home.workspace-create" />}
        tip="Your free signup credits land the moment the workspace exists."
      />
    </div>
  )
}
