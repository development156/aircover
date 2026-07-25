'use client'

import { useActionState, useEffect } from 'react'
import { Plus } from 'lucide-react'
import { toast } from 'sonner'

import { createWorkspace } from '@/app/actions/workspace'
import { cn } from '@/lib/utils'

/**
 * The one real "create my first workspace" affordance, shared by every screen
 * that has to offer it.
 *
 * It exists as its own component because the offer now appears in two places —
 * the topbar switcher's empty state and /wallet's first run — and a second copy
 * of `useActionState(createWorkspace)` is how the two would drift: one growing a
 * pending label the other lacks, or one forgetting to surface the failure at
 * all. `createWorkspace` redirects into onboarding on success, so the ONLY
 * states this component can land in are pending and failed; both are shown.
 */

export const CREATE_WORKSPACE_LABEL = 'Create workspace'

const VARIANTS = {
  /** Topbar: sits among bordered shell controls, so it stays quiet. */
  quiet:
    'border border-line bg-bg px-3 py-[7px] font-semibold text-muted hover:bg-s1 hover:text-ink rounded-input',
  /** Empty state: the single primary action on the screen, so it leads. */
  primary:
    'bg-primary px-4 py-2 font-semibold text-primary-foreground hover:bg-primary-strong hover:text-white active:scale-[.97] rounded-pill',
} as const

export interface CreateWorkspaceButtonProps {
  variant?: keyof typeof VARIANTS
  /** Sahoda Guide anchor, when this instance is a tour target. */
  guideAnchor?: string
}

export function CreateWorkspaceButton({
  variant = 'quiet',
  guideAnchor,
}: CreateWorkspaceButtonProps) {
  const [state, action, pending] = useActionState(createWorkspace, null)

  useEffect(() => {
    if (!state) return
    // Success redirects into onboarding, so only failures ever land here.
    toast(state.message)
  }, [state])

  return (
    <form action={action}>
      <button
        type="submit"
        disabled={pending}
        data-guide={guideAnchor}
        className={cn(
          'flex items-center gap-2 transition-micro disabled:opacity-45',
          VARIANTS[variant],
        )}
      >
        <Plus size={16} className="shrink-0" aria-hidden />
        {/* The label keeps its accessible name while pending — a button that
            renames itself mid-flight is a different button to a screen reader. */}
        <span>{CREATE_WORKSPACE_LABEL}</span>
        {pending ? <span className="text-[13px] font-normal opacity-80">creating…</span> : null}
      </button>
    </form>
  )
}
