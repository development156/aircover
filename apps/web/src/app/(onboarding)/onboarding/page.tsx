import { creditCost } from '@sahoda/shared'

import { OnboardingStage } from '@/components/onboarding/stage/onboarding-stage'
import { SignOutLink } from '@/components/onboarding/sign-out-link'
import { CreateWorkspaceButton } from '@/components/workspace/create-workspace-button'
import { readBootVideoSeen } from '@/lib/onboarding/boot-video-seen'
import { readActiveBrandMemory } from '@/lib/onboarding/read-brain'
import { activeWorkspaceRead } from '@/lib/workspaces'

export const metadata = { title: 'Set up your Brand Brain' }

/**
 * A server component, because three things have to be true before the first
 * screen renders and none of them can be decided on the client:
 *
 *  · whether a workspace exists at all,
 *  · whether this workspace already HAS a Brand Brain (re-entry loads it),
 *  · whether the next resolve is free (a client-supplied "free" flag is a
 *    client that can say free every time).
 *
 * ── TWO KINDS OF NOTHING, TWO SENTENCES ─────────────────────────────────────
 * Both reads answer three ways, and this page used to collapse the third into
 * the second. "You have no workspace yet" with a Create button, rendered
 * because one query hiccuped, tells a paying customer mid-onboarding to make a
 * workspace they already have. "Could not read" gets a reload and no button;
 * "none" gets the button and no reload, because reloading cannot create one.
 */
export default async function OnboardingPage() {
  const workspace = await activeWorkspaceRead()

  if (workspace.status === 'unreadable') {
    return (
      <FirstRunCard
        title="Sahoda could not read your workspace"
        body="The read failed before it could say whether you have one, so this is not a verdict on your account. Nothing was changed. Reload to try again."
        action={<ReloadLink />}
      />
    )
  }

  // Reached by anyone who lands here without a workspace. The normal route in
  // is `createWorkspace`, which redirects here AFTER bootstrapping one — but
  // /onboarding is a plain URL, and without this a new user could answer all
  // three screens and only then be told to go back and make a workspace.
  if (workspace.status === 'none') {
    return (
      <FirstRunCard
        title="You have no workspace yet"
        body="Your Brand Brain belongs to a workspace, so there has to be one to put it in. This takes a second and costs nothing."
        action={<CreateWorkspaceButton variant="primary" />}
      />
    )
  }

  // Workspace-scoped, and read ONCE. `isFirstResolve` asking again would be a
  // second query that can disagree with this one — leaving the screen offering
  // a free build the server is about to charge for, or the reverse.
  //
  // The boot flag is per PERSON and the brain is per WORKSPACE, so they are two
  // reads and not one — but they are the same wait.
  const [saved, bootSeen] = await Promise.all([
    readActiveBrandMemory(workspace.workspace.id),
    readBootVideoSeen(),
  ])

  /**
   * The read that decides the price did not answer. Rendering the stage would
   * have to pick "free" or "50 credits" for a screen that shows the number
   * before the button, and either pick is a claim nothing measured. The action
   * refuses on the same arm, so the screen says so here rather than after.
   */
  if (saved.status === 'unreadable') {
    return (
      <FirstRunCard
        title="Sahoda could not read your Brand Brain"
        body="It cannot tell whether this workspace has one yet, so it cannot say whether the next build is free. Nothing was changed. Reload to try again."
        action={<ReloadLink />}
      />
    )
  }

  return (
    <OnboardingStage
      workspaceId={workspace.workspace.id}
      workspaceName={workspace.workspace.name}
      isFree={saved.status === 'none'}
      cost={creditCost('brand_research')}
      hasSavedBrain={saved.status === 'ok'}
      /**
       * `unknown` COUNTS AS SEEN, and that is a decision rather than a default.
       *
       * The film cannot be skipped. Playing it at somebody who has already sat
       * through it, because one query failed, is a worse thing to do to them
       * than never showing it — a customer who misses a brand animation has lost
       * nothing they can name, and one who is made to watch it twice with no way
       * out has been trapped by our error.
       */
      hasSeenBootVideo={bootSeen !== 'not-seen'}
    />
  )
}

/** A plain link back to this URL: the one remedy a failed read has. */
function ReloadLink() {
  return (
    <a
      href="/onboarding"
      // The same primary shape `CreateWorkspaceButton` renders on the sibling card.
      className="inline-flex h-control items-center rounded-sm bg-primary px-3 type-sm font-[550] text-primary-foreground transition-micro hover:bg-ink active:translate-y-[0.5px] max-narrow:min-h-11"
    >
      Reload
    </a>
  )
}

interface FirstRunCardProps {
  title: string
  body: string
  action: React.ReactNode
}

/**
 * Two things, and only one of them is an action. See `SignOutLink`: the
 * landing rule makes these the ONLY screens a workspace-less account can
 * reach, and the app's sign-out lives in a topbar that is not rendered here.
 */
function FirstRunCard({ title, body, action }: FirstRunCardProps) {
  return (
    <div className="mx-auto max-w-content p-page max-narrow:p-page-mobile">
      <div className="surface-ring rounded-card bg-surface p-5">
        <span className="type-eyebrow text-accent">Brand Brain</span>
        <h1 className="mt-1 type-h2 tracking-[-0.02em] text-ink">{title}</h1>
        <p className="mt-1 type-sm text-muted">{body}</p>
        <div className="mt-5 flex items-center gap-5">
          {action}
          <SignOutLink />
        </div>
      </div>
    </div>
  )
}
