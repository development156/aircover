'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { Check, ChevronsUpDown } from 'lucide-react'

import { setActiveWorkspace } from '@/app/actions/workspace'
import { CreateWorkspaceButton } from '@/components/workspace/create-workspace-button'
import { cn } from '@/lib/utils'
import type { WorkspaceOption } from '@/lib/workspaces'

interface WorkspaceSwitcherProps {
  workspaces: WorkspaceOption[]
  active: WorkspaceOption | null
  /**
   * The workspace read did not answer. NOT the same as an empty list, and the
   * difference is the whole reason this prop exists — see the third branch.
   */
  unreadable?: boolean
}

// Initial-letter avatar — honest stand-in until per-workspace Brand Skin colors
// load here. dark: --t50 stays warm-light while --acc flips to Orange300 (~1.7:1),
// so the badge surface becomes s2 on dark (accent-on-tint contrast rule).
function WorkspaceBadge({ name }: { name: string }) {
  const initial = name.trim().charAt(0).toUpperCase() || '?'
  return (
    <span
      aria-hidden
      className="grid size-[22px] shrink-0 place-items-center rounded-[6px] bg-tint-50 text-[12px] font-bold text-accent dark:bg-s2"
    >
      {initial}
    </span>
  )
}

export function WorkspaceSwitcher({
  workspaces,
  active,
  unreadable = false,
}: WorkspaceSwitcherProps) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuId = useId()
  const labelId = useId()

  useEffect(() => {
    if (!open) return

    function onPointerDown(event: PointerEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false)
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') closeToTrigger()
    }

    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
    // closeToTrigger is stable within a render; open is the real dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  function closeToTrigger() {
    setOpen(false)
    triggerRef.current?.focus()
  }

  // AN UNREADABLE READ IS NOT AN EMPTY ACCOUNT. Both used to arrive here as an
  // empty array, so a Supabase hiccup put "Create workspace" in the topbar of a
  // founder who already has one — a claim about their account that nothing
  // measured. It is not destructive (bootstrap_workspace replays for the owner
  // and returns the existing row) but it is false, and it is the same
  // one-null-two-meanings defect /wallet, /home and /connections each had to fix
  // downstream of THIS read.
  //
  // A span, not a button: the remedy for an unreadable read is to reload, this
  // control cannot reload anything, and a control that cannot do what it implies
  // is the dead end the kit forbids. The page below states the remedy.
  if (unreadable) {
    return (
      <span
        role="status"
        className="surface-ring-firm grid h-control shrink-0 place-items-center rounded-sm bg-surface px-3 text-[13px] font-[550] whitespace-nowrap text-muted"
      >
        Workspace unavailable
      </span>
    )
  }

  // Honest empty state: no memberships yet (bootstrap pending) → a real create
  // affordance, not a disabled placeholder. The action, its pending label and
  // its failure toast live in CreateWorkspaceButton, which /wallet's first-run
  // state renders too — one offer, one behaviour, in both places.
  if (workspaces.length === 0 || !active) {
    // Compact on a phone, not hidden. MEASURED 2026-09-05 (smoke,
    // no-truncated-labels at 390): the 167px label pushed the user menu to
    // x=432 in a 390px viewport. The first repair hid the whole button there,
    // and `shell-probe.spec.ts` (run 34012814133) refused it: this trigger is
    // what tells the no-workspace state apart from every other, on every
    // width. So the words go sr-only on a phone and the button stays.
    return <CreateWorkspaceButton guideAnchor="topbar.workspace-create" compactOnNarrow />
  }

  return (
    <div
      ref={containerRef}
      // One workspace on a phone has nothing to switch to, and its trigger was
      // 48px of a 35px overflow (see credit-chip.tsx for the measurement). The
      // switcher returns the moment there is a second workspace to choose.
      // Never hidden on a phone, even with one workspace: shell-probe.spec.ts
      // (run 34020306051) needs the switcher to tell the bootstrapped state from
      // the empty one, and the trigger below already compacts to its 44px badge
      // under `narrow`, so it costs the row 44px and no words.
      className="relative min-w-0"
    >
      <button
        ref={triggerRef}
        type="button"
        data-guide="topbar.workspace"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((value) => !value)}
        /* Collapsed to its badge on a phone by 2f9fca1, which left it 40px across —
           the height cleared the floor and the width did not. `min-w` finishes what
           that fix started; the badge itself stays 22px and centres. */
        className="flex h-control min-w-0 items-center gap-2 rounded-input border border-line bg-bg px-3 font-semibold transition-micro hover:bg-s1 max-narrow:h-11 max-narrow:min-w-[44px] max-narrow:justify-center max-narrow:px-2"
      >
        <WorkspaceBadge name={active.name} />
        {/* ── THE NAME STEPS ASIDE ON A PHONE, IT DOES NOT SHRINK ────────────
            MEASURED at 390px WITH a workspace: the topbar row ran to 407px and
            the user menu sat 17px off-screen, so the document scrolled
            sideways. The existing @smoke guard was green throughout because it
            signs in and never bootstraps a workspace — and with no workspace
            there is no credit pill, so it measured a row three items short.

            `no-truncated-labels.spec.ts` says it in its own failure message:
            "Carry FEWER things, not smaller ones." Squeezing the label to 4ch
            would have bought the pixels and rendered "saho…", which is the
            "S Sah" failure again. The badge already identifies the workspace by
            its initial, and the full name is one tap away in the menu.

            `sr-only`, never `hidden`: `display:none` removes the node from the
            accessibility tree, and this span IS the button's accessible name —
            hiding it would leave the switcher announced as an unnamed button.

            THE BREAKPOINT IS `wide` (1180), NOT `narrow` (700). Fixing only the
            phone left 768px broken by 91px — the command palette appears at 700
            and the row gains an item exactly where the rail has not yet given
            any width back. `wide` is where the RAIL collapses to icons, so the
            switcher now collapses with it: one breakpoint, one story, and the
            crowded 700-1179 band is covered rather than stepped over. */}
        <span className="max-w-[16ch] truncate max-wide:sr-only">{active.name}</span>
        <ChevronsUpDown size={15} className="shrink-0 text-muted max-wide:hidden" aria-hidden />
      </button>

      {open ? (
        <div
          id={menuId}
          aria-labelledby={labelId}
          className="absolute top-[calc(100%+6px)] left-0 z-15 min-w-[240px] overflow-hidden rounded-card border border-line bg-bg p-1.5 shadow-pop"
        >
          <p id={labelId} className="type-eyebrow px-2.5 py-1.5 text-muted">
            Workspaces
          </p>
          {workspaces.map((ws) => {
            const isActive = ws.slug === active.slug
            return (
              /* ── SUBMIT FIRST, CLOSE AFTER ──────────────────────────────
                 MEASURED 2026-09-06 (wt-core preview, Chromium): this button
                 closed the menu from its own onClick. React committed that
                 close in the microtask checkpoint the browser runs between the
                 click listeners and the form's activation behaviour, so the
                 form was gone before it could submit — "Form submission
                 canceled because the form is not connected", and no workspace
                 ever switched. The action now runs to completion first; the
                 menu closes on the way back. `workspace-switcher.test.tsx`
                 plays the browser's order by hand and fails on the old shape. */
              <form
                key={ws.id}
                action={async (formData: FormData) => {
                  await setActiveWorkspace(formData)
                  closeToTrigger()
                }}
              >
                <input type="hidden" name="slug" value={ws.slug} />
                <button
                  type="submit"
                  aria-current={isActive ? 'true' : undefined}
                  className={cn(
                    'flex w-full items-center gap-2.5 rounded-input px-2.5 py-2 text-left transition-micro hover:bg-s1',
                    isActive ? 'font-semibold' : 'font-medium',
                  )}
                >
                  <WorkspaceBadge name={ws.name} />
                  <span className="min-w-0 flex-1 truncate">{ws.name}</span>
                  {isActive ? (
                    <Check size={16} className="shrink-0 text-accent" aria-hidden />
                  ) : null}
                </button>
              </form>
            )
          })}
          {/*
            No in-menu "Create workspace": bootstrap_workspace is the signup path
            with an owner replay guard — a second call returns the EXISTING
            workspace, it does not create another. Showing a create button here
            would be a fake affordance. Creating additional workspaces needs a
            separate flow (not in Alpha); the empty state below is the real
            first-workspace path.
          */}
        </div>
      ) : null}
    </div>
  )
}
