import { UserButton } from '@clerk/nextjs'
import * as Sentry from '@sentry/nextjs'

import { MobileHeaderMark } from '@/components/shell/bottom-nav'
import { BrainRing } from '@/components/shell/brain-ring'
import { CommandPalette } from '@/components/shell/command-palette'
import { CreditChip } from '@/components/shell/credit-chip'
import { ThemeToggle } from '@/components/shell/theme-toggle'
import { WorkspaceSwitcher } from '@/components/shell/workspace-switcher'
import { BrandMark } from '@/components/shell/brand-mark'
import { readBrandLogo, type BrandLogo } from '@/lib/brand/logo'
import { activeThemeTokens } from '@/lib/brand/read-theme'
import type { ThemeTokens } from '@sahoda/shared'
import { readBrain, type BrainRead } from '@/lib/brand/read-brain'
import { readBalance, type BalanceRead } from '@/lib/wallet/read'
import {
  getActiveWorkspaceSlug,
  readWorkspaces,
  resolveActiveWorkspace,
  type WorkspacesRead,
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
 * Two of the three reads below already guard themselves (`readWorkspaces` and
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
  const [workspacesRead, activeSlug, balance, brain] = await Promise.all([
    // The three-way read, not the lossy `listWorkspaces`. An empty array here
    // used to mean two different things — "this account has none" and "we could
    // not look" — and the switcher rendered "Create workspace" for both, telling
    // a founder with a live workspace that they had none. See lib/workspaces.ts.
    // A THROW is `unreadable` for the same reason the balance chip's is: it is
    // exactly what a read that blew up amounts to, and never an empty account.
    softRead<WorkspacesRead>('workspaces', readWorkspaces, { status: 'unreadable' }),
    softRead<string | null>('active_workspace_slug', getActiveWorkspaceSlug, null),
    // The same three-way answer /wallet renders, so the chip and the page
    // cannot disagree. A throw here is `unreadable` — the honest fallback,
    // since a read that blew up is exactly that, and never a placeholder 0.
    softRead<BalanceRead>('available_credits', readBalance, { status: 'unreadable' }),
    // Same discipline for the ring: the union /brain renders, and a throw is
    // `unreadable` rather than a 0/15 that would report every confirmed field
    // as unconfirmed. `readBrain` already catches internally — this wrapper is
    // the SHELL's guarantee, not a restatement of that module's internals.
    softRead<BrainRead>('brand_brain', readBrain, { status: 'unreadable' }),
  ])
  const workspaces = workspacesRead.status === 'ok' ? workspacesRead.workspaces : []
  const active = resolveActiveWorkspace(workspaces, activeSlug)

  /**
   * THE BRAND MARK'S TWO INPUTS, together, and only once the workspace is known.
   *
   * Both are cached per render: the layout already read the theme for Brand
   * Skin, so this costs no second query, and the logo is one signed link. A
   * workspace that has neither renders the chip in Sahoda's own colour, which is
   * the truthful thing to show when a customer has not given us a brand.
   */
  const [logo, theme] = active
    ? await Promise.all([
        softRead<BrandLogo | null>('brand_logo', () => readBrandLogo(active.id), null),
        softRead<ThemeTokens | null>('brand_theme', () => activeThemeTokens(active.id), null),
      ])
    : [null, null]

  return (
    <header
      data-guide="topbar.root"
      /* GLASS, and this is the one surface where the brief's two wishes meet.
         "Glassy and transparent" and "exactly like the reference" are not the
         same instruction — the reference's app is not glass anywhere except its
         auth card. The resolution is by surface ROLE: glass on chrome, opaque
         on data. A topbar is chrome. It is one fixed element, so its
         backdrop-filter costs one composited layer for the whole session rather
         than one per row.

         `border-b` goes: the topbar now separates from the content by BLUR and
         by the gradient moving behind it, which is the same "separate by fill,
         not by line" rule the card ladder follows. */
      className="glass sticky top-0 z-5 flex h-topbar flex-none items-center gap-3 px-page max-narrow:gap-2 max-narrow:px-page-mobile"
    >
      {/* On a phone the rail is gone entirely, and the brand mark went with it —
          so it reappears here. Hidden ≥768px, where the rail carries the full
          lockup and a second mark would be a duplicate. */}
      <MobileHeaderMark />
      {/* ── min-w-0 SHRANK THE SLOT BELOW THE CONTROL INSIDE IT ─────────────────
          `min-w-0` was added so a long workspace name could not push the credit
          pill and avatar off the right edge at 375px. It let the SLOT shrink —
          but the control inside is `shrink-0`, so the slot went narrower than the
          control and the control painted outside it, under whichever sibling was
          drawn next.

          MEASURED with no workspace: the slot was 105px and "Create workspace"
          164px, so it spilled 59px — the credit pill covered 51px of it at 390px
          and 11px at 430px, and the command palette 52px at 700px. Hiding the
          pill on a phone moved the collision rather than ending it; this is where
          it actually lives.

          `shrink-0` is safe here in a way it was not when that comment was
          written: the switcher's trigger now carries its own `max-w-[16ch]
          truncate` (`7ch` below 700px), so this slot is bounded by its control at
          every width and can no longer be the thing that overflows. */}
      {/* THE BRAND, BESIDE THE WORKSPACE IT BELONGS TO. Founder's ruling,
          2026-08-29: the logo goes here, and it is the control that changes the
          brand colour rather than a decoration. */}
      <BrandMark logoUrl={logo?.url ?? null} primary={theme?.primary ?? null} />
      <div className="shrink-0">
        <WorkspaceSwitcher
          workspaces={workspaces}
          active={active}
          unreadable={workspacesRead.status !== 'ok'}
        />
      </div>
      {/* Centred, and it does the centring itself via `mx-auto` — a spacer div
          would centre it against the wrong axis the moment the switcher's width
          changes with the workspace name. */}
      <CommandPalette />
      {/* Beside the credit chip, and before it: the brain is what Sahoda spends
          those credits ON, so it reads left-to-right as cause then cost. */}
      <BrainRing brain={brain} />
      <CreditChip balance={balance} />
      {/* The reference's right cluster ends icon, then avatar. The dark theme
          was fully built and completely unreachable until this button existed —
          see ThemeToggle. */}
      {/* `ml-auto` below 700px, because the element that used to do the pushing
          is not there. `CommandPalette` carries `mx-auto` and absorbs the free
          space at ≥700px, but it is `max-narrow:hidden` — and once the credit
          pill also steps aside (no workspace, narrow), nothing was left to fill
          the row and the toggle and avatar drifted 74px short of the edge.
          MEASURED: last control right=316 in a 390px viewport. */}
      <div className="max-narrow:ml-auto" />
      <ThemeToggle />
      <div
        data-guide="topbar.avatar"
        className="grid size-8 flex-none place-items-center max-narrow:size-11"
      >
        <UserButton />
      </div>
    </header>
  )
}
