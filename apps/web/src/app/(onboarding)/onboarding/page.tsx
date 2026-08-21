import { creditCost } from '@sahoda/shared'

import { OnboardingStage } from '@/components/onboarding/stage/onboarding-stage'
import { CreateWorkspaceButton } from '@/components/workspace/create-workspace-button'
import { activeBrandMemory } from '@/lib/onboarding/read-brain'
import { getActiveWorkspace } from '@/lib/workspaces'

export const metadata = { title: 'Set up your Brand Brain' }

/**
 * A server component, because three things have to be true before the first
 * screen renders and none of them can be decided on the client:
 *
 *  · whether a workspace exists at all,
 *  · whether this workspace already HAS a Brand Brain (re-entry loads it),
 *  · whether the next resolve is free (a client-supplied "free" flag is a
 *    client that can say free every time).
 */
export default async function OnboardingPage() {
  const workspace = await getActiveWorkspace()

  // Reached by anyone who lands here without a workspace. The normal route in
  // is `createWorkspace`, which redirects here AFTER bootstrapping one — but
  // /onboarding is a plain URL, and without this a new user could answer all
  // three screens and only then be told to go back and make a workspace.
  if (!workspace) {
    return (
      <div className="mx-auto max-w-content p-page max-narrow:p-page-mobile">
        <div className="surface-ring rounded-card bg-surface p-5">
          <span className="type-eyebrow text-accent">Brand Brain</span>
          <h1 className="mt-1 text-[20px] font-[650] tracking-[-0.02em] text-ink">
            Make a workspace first
          </h1>
          <p className="mt-1 text-[13.5px] text-muted">
            Your Brand Brain belongs to a workspace, so there has to be one to put it in. This takes
            a second and costs nothing.
          </p>
          <div className="mt-5">
            <CreateWorkspaceButton variant="primary" />
          </div>
        </div>
      </div>
    )
  }

  // Workspace-scoped, and read ONCE. `isFirstResolve` asking again would be a
  // second query that can disagree with this one — leaving the screen offering
  // a free build the server is about to charge for, or the reverse.
  const saved = await activeBrandMemory(workspace.id)

  return (
    <OnboardingStage
      workspaceId={workspace.id}
      workspaceName={workspace.name}
      isFree={saved === null}
      cost={creditCost('brand_research')}
      hasSavedBrain={saved !== null}
    />
  )
}
