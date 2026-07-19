import { UserButton } from '@clerk/nextjs'

import { CreditChip } from '@/components/shell/credit-chip'
import { WorkspaceSwitcher } from '@/components/shell/workspace-switcher'
import { readAvailableCredits } from '@/lib/wallet/read'
import { getActiveWorkspaceSlug, listWorkspaces, resolveActiveWorkspace } from '@/lib/workspaces'

export async function Topbar() {
  const [workspaces, activeSlug, credits] = await Promise.all([
    listWorkspaces(),
    getActiveWorkspaceSlug(),
    // Available (total − held), or null when unreadable — never a placeholder 0.
    readAvailableCredits(),
  ])
  const active = resolveActiveWorkspace(workspaces, activeSlug)

  return (
    <header
      data-guide="topbar.root"
      className="sticky top-0 z-5 flex h-topbar items-center gap-3 border-b border-line bg-s1/90 px-page backdrop-blur-[6px] max-narrow:px-page-mobile"
    >
      <WorkspaceSwitcher workspaces={workspaces} active={active} />
      <div className="ml-auto" />
      <CreditChip credits={credits} />
      <div data-guide="topbar.avatar" className="grid size-8 place-items-center">
        <UserButton />
      </div>
    </header>
  )
}
