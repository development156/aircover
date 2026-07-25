import { UserButton } from '@clerk/nextjs'
import * as Sentry from '@sentry/nextjs'

import { CreditChip } from '@/components/shell/credit-chip'
import { WorkspaceSwitcher } from '@/components/shell/workspace-switcher'
import { readBalance, type BalanceRead } from '@/lib/wallet/read'
import {
  getActiveWorkspaceSlug,
  listWorkspaces,
  resolveActiveWorkspace,
  type WorkspaceOption,
} from '@/lib/workspaces'

/**
 * Run one shell read, degrading to `fallback` rather than throwing.
 *
 * WHY THE SHELL GUARDS ITSELF. Topbar is rendered by (app)/layout.tsx, and
 * (app)/error.tsx is a SIBLING of that layout — React hands an error to the
 * nearest boundary above the component that threw, and for a layout that is not
 * its own sibling. So anything this component throws sails straight past the
 * segment boundary to global-error.tsx, which replaces the entire document,
 * takes ClerkProvider and the fonts with it, and deliberately offers no retry.
 * A single unreadable row would turn a degraded topbar into a dead session.
 * Guarding at the source keeps a failed read as what it actually is: a missing
 * value in one chip, with the rest of the shell still on screen and navigable.
 *
 * Two of the three reads below already guard themselves (`listWorkspaces` and
 * `readBalance` both catch internally and return an empty/unreadable value),
 * so today this wrapper is load-bearing for exactly one — `getActiveWorkspaceSlug`,
 * whose `cookies()` call throws when invoked outside a request scope. It wraps
 * all three anyway so the guarantee belongs to the SHELL rather than to the
 * current internals of three separate modules: a read added here later, or a
 * try/catch removed there, must not silently re-open the path to global-error.
 */
async function softRead<T>(label: string, read: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await read()
  } catch (error) {
    // Swallowed for the user, never for us. Without this report the degraded
    // topbar is indistinguishable from a genuinely empty account — nobody is
    // paged, and "my workspaces vanished" arrives as a support ticket instead.
    Sentry.captureException(error, { tags: { shell_read: label } })
    return fallback
  }
}

export async function Topbar() {
  // Each read carries its own fallback rather than sharing one catch around the
  // Promise.all: `Promise.all` rejects the moment ANY input rejects, so a single
  // failing read would throw away the two that succeeded and blank the whole
  // topbar over one bad row.
  const [workspaces, activeSlug, balance] = await Promise.all([
    softRead<WorkspaceOption[]>('workspaces', listWorkspaces, []),
    softRead<string | null>('active_workspace_slug', getActiveWorkspaceSlug, null),
    // The same three-way answer /wallet renders, so the chip and the page
    // cannot disagree. A throw here is `unreadable` — the honest fallback,
    // since a read that blew up is exactly that, and never a placeholder 0.
    softRead<BalanceRead>('available_credits', readBalance, { status: 'unreadable' }),
  ])
  const active = resolveActiveWorkspace(workspaces, activeSlug)

  return (
    <header
      data-guide="topbar.root"
      className="sticky top-0 z-5 flex h-topbar items-center gap-3 border-b border-line bg-s1/90 px-page backdrop-blur-[6px] max-narrow:px-page-mobile"
    >
      <WorkspaceSwitcher workspaces={workspaces} active={active} />
      <div className="ml-auto" />
      <CreditChip balance={balance} />
      <div data-guide="topbar.avatar" className="grid size-8 place-items-center">
        <UserButton />
      </div>
    </header>
  )
}
