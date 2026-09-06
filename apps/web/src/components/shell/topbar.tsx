import { UserButton } from '@clerk/nextjs'
import * as Sentry from '@sentry/nextjs'

import { MobileHeaderMark } from '@/components/shell/bottom-nav'
import { BrainRing } from '@/components/shell/brain-ring'
import { CommandPalette } from '@/components/shell/command-palette'
import { ThemeToggle } from '@/components/shell/theme-toggle'
import { WorkspaceSwitcher } from '@/components/shell/workspace-switcher'
import { BrandMark } from '@/components/shell/brand-mark'
import { readBrandLogo, readBrandLogoDark, type BrandLogo } from '@/lib/brand/logo'
import { activeThemeTokens } from '@/lib/brand/read-theme'
import type { ThemeTokens } from '@sahoda/shared'
import { readBrain, type BrainRead } from '@/lib/brand/read-brain'
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
  const [workspacesRead, activeSlug, brain] = await Promise.all([
    // The three-way read, not the lossy `listWorkspaces`. An empty array here
    // used to mean two different things — "this account has none" and "we could
    // not look" — and the switcher rendered "Create workspace" for both, telling
    // a founder with a live workspace that they had none. See lib/workspaces.ts.
    // A THROW is `unreadable` for the same reason the balance chip's is: it is
    // exactly what a read that blew up amounts to, and never an empty account.
    softRead<WorkspacesRead>('workspaces', readWorkspaces, { status: 'unreadable' }),
    softRead<string | null>('active_workspace_slug', getActiveWorkspaceSlug, null),
    // The balance read went with the chip. /wallet reads it for itself, so
    // nothing here needs it — and this is the hottest query in the product,
    // running on every route of every page load.
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
  const [logo, logoDark, theme] = active
    ? await Promise.all([
        softRead<BrandLogo | null>('brand_logo', () => readBrandLogo(active.id), null),
        // The dark-background variant, read beside the light one rather than
        // after it. Its own `softRead` key, because a workspace with a light
        // logo and no dark one is the ordinary case and must not read as a
        // failure of the pair.
        softRead<BrandLogo | null>('brand_logo_dark', () => readBrandLogoDark(active.id), null),
        softRead<ThemeTokens | null>('brand_theme', () => activeThemeTokens(active.id), null),
      ])
    : [null, null, null]

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
         not by line" rule the card ladder follows.

         ── THE BAR SPANS THE WINDOW, ITS CONTENTS SPAN THE CONTENT ──────────
         The glass has to reach both edges or the blur stops halfway across a
         wide screen. Its CONTENTS must not: `<main>` is `mx-auto max-w-content
         p-page`, so above 1320px the page's first column starts inboard of the
         viewport while the topbar's first control sat flush at the padding.
         MEASURED at 1920: the workspace switcher began 300px left of the
         greeting under it. The inner wrapper below carries the same
         `mx-auto max-w-content` the page does, so the two share one left edge
         at every width. */
      className="glass sticky top-0 z-5 h-topbar flex-none px-page max-narrow:px-page-mobile"
    >
      {/* ── THREE ZONES, AND THE OUTER TWO SHARE THE SPARE WIDTH ─────────────
          `flex-1 basis-0` on both flanks means they are handed EQUAL amounts of
          whatever is left after the search, so the search sits on the window's
          true centre line. The previous version put `mx-auto` on the search
          itself, which centres a flex item in the space its neighbours leave —
          and those neighbours are not the same width (two controls on the left,
          four on the right), so the search always sat left of centre by half
          their difference.

          It also retires the `max-narrow:ml-auto` spacer that used to sit
          before the theme toggle: `justify-end` on the right zone does that job
          at every width, including the one where the search is hidden and the
          credit pill has stepped aside. */}
      <div className="mx-auto flex h-full w-full max-w-content items-center gap-3 max-narrow:gap-2">
        <div className="flex min-w-0 flex-1 basis-0 items-center gap-2">
          {/* On a phone the rail is gone entirely, and the brand mark went with
              it — so it reappears here. Hidden ≥768px, where the rail carries
              the full lockup and a second mark would be a duplicate. */}
          <MobileHeaderMark />
          {/* THE BRAND, BESIDE THE WORKSPACE IT BELONGS TO. Founder's ruling,
              2026-08-29: the logo goes here, and it is the control that changes
              the brand colour rather than a decoration. */}
          <BrandMark
            logoUrl={logo?.url ?? null}
            logoUrlDark={logoDark?.url ?? null}
            primary={theme?.primary ?? null}
            /* Whether there is anything to switch TO. A workspace that has never
               given Sahoda a brand gets the panel on a press rather than a
               toggle that reports a change which did not happen. */
            hasTheme={theme !== null}
          />
          {/* `shrink-0` is safe because the switcher's trigger carries its own
              `max-w-[16ch] truncate` (`7ch` below 700px), so this slot is
              bounded by its control at every width and cannot be the thing that
              overflows. The zone around it is `min-w-0`, which is what lets the
              truncation actually engage. */}
          <div className="shrink-0">
            <WorkspaceSwitcher
              workspaces={workspaces}
              active={active}
              unreadable={workspacesRead.status !== 'ok'}
            />
          </div>
        </div>

        <CommandPalette />

        <div className="flex flex-1 basis-0 items-center justify-end gap-2">
          {/* ── THE CREDIT CHIP IS GONE FROM HERE ────────────────────────────
              Founder's ruling: credits live in the wallet, and the top bar shows
              none. It sat beside this ring on all 59 routes, which made the
              balance the most-repeated figure in the product — docs/40 §2.3
              counted it three times on /home alone.

              WHAT REPLACES IT IS NOTHING, and that is the point. The balance was
              never how a spend is disclosed: every paid button in this product
              carries its own price in its label, which is the rule that actually
              protects the reader. A chip that follows you onto /settings and
              /inbox is a number with no decision attached to it. /wallet is one
              click from every screen in the rail. */}
          <BrainRing brain={brain} />
          {/* The reference's right cluster ends icon, then avatar. The dark
              theme was fully built and completely unreachable until this button
              existed — see ThemeToggle. */}
          <ThemeToggle />
          <div
            data-guide="topbar.avatar"
            className="grid size-control flex-none place-items-center max-narrow:size-11"
          >
            <UserButton />
          </div>
        </div>
      </div>
    </header>
  )
}
