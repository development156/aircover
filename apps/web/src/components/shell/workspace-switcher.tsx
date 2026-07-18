'use client'

import { useActionState, useEffect, useId, useRef, useState } from 'react'
import { Check, ChevronsUpDown, Plus } from 'lucide-react'
import { toast } from 'sonner'

import { createWorkspace, setActiveWorkspace } from '@/app/actions/workspace'
import { cn } from '@/lib/utils'
import type { WorkspaceOption } from '@/lib/workspaces'

interface WorkspaceSwitcherProps {
  workspaces: WorkspaceOption[]
  active: WorkspaceOption | null
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

const CREATE_BUTTON_LABEL = 'Create workspace'

export function WorkspaceSwitcher({ workspaces, active }: WorkspaceSwitcherProps) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuId = useId()
  const labelId = useId()

  // createWorkspace returns an honest typed error until the wt-db bootstrap RPC
  // lands (never a fake success). State + toast live on the ALWAYS-mounted root
  // so the toast still fires if the menu closes (e.g. an outside click) mid
  // round-trip — the in-menu and empty-state buttons share this one action.
  const [createState, createAction, createPending] = useActionState(createWorkspace, null)
  useEffect(() => {
    if (createState && !createState.ok) toast(createState.message)
  }, [createState])

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

  // Honest empty state: no memberships yet (bootstrap pending) → a real create
  // affordance, not a disabled placeholder.
  if (workspaces.length === 0 || !active) {
    return (
      <form action={createAction}>
        <button
          type="submit"
          disabled={createPending}
          data-guide="topbar.workspace-create"
          className="flex items-center gap-2 rounded-input border border-line bg-bg px-3 py-[7px] font-semibold text-muted transition-micro hover:bg-s1 hover:text-ink disabled:opacity-45"
        >
          <Plus size={16} className="shrink-0" aria-hidden />
          <span>{createPending ? 'Creating…' : CREATE_BUTTON_LABEL}</span>
        </button>
      </form>
    )
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        data-guide="topbar.workspace"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((value) => !value)}
        className="flex items-center gap-2 rounded-input border border-line bg-bg px-3 py-[7px] font-semibold transition-micro hover:bg-s1"
      >
        <WorkspaceBadge name={active.name} />
        <span className="max-w-[16ch] truncate">{active.name}</span>
        <ChevronsUpDown size={15} className="shrink-0 text-muted" aria-hidden />
      </button>

      {open ? (
        <div
          id={menuId}
          aria-labelledby={labelId}
          className="absolute top-[calc(100%+6px)] left-0 z-15 min-w-[240px] overflow-hidden rounded-card border border-line bg-bg p-1.5 shadow-pop"
        >
          <p
            id={labelId}
            className="px-2.5 py-1.5 text-[11px] font-semibold tracking-[0.08em] text-faint uppercase"
          >
            Workspaces
          </p>
          {workspaces.map((ws) => {
            const isActive = ws.slug === active.slug
            return (
              <form key={ws.id} action={setActiveWorkspace}>
                <input type="hidden" name="slug" value={ws.slug} />
                <button
                  type="submit"
                  onClick={closeToTrigger}
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
          <div className="my-1.5 h-px bg-line" aria-hidden />
          <form action={createAction}>
            <button
              type="submit"
              disabled={createPending}
              data-guide="topbar.workspace-create"
              className="flex w-full items-center gap-2.5 rounded-input px-2.5 py-2 font-medium text-muted transition-micro hover:bg-s1 hover:text-ink disabled:opacity-45"
            >
              <Plus size={16} className="shrink-0" aria-hidden />
              <span>{createPending ? 'Creating…' : CREATE_BUTTON_LABEL}</span>
            </button>
          </form>
        </div>
      ) : null}
    </div>
  )
}
