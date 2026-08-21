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

// Both wear the kit's control shape: 34px tall, 6px radius, 13px at weight 550 —
// and, below 700px, the kit's 44px touch floor.
//
// ── WHY THE FLOOR HAD TO BE REPEATED HERE ────────────────────────────────────
// `components/ui/button.tsx` carries `max-narrow:min-h-[44px]` on every size, and
// this component is NOT that button: it is a bespoke `<button>` with its own class
// string, so 95ed24f's floor fix went round it. It rendered 164x34 on a phone —
// the same sibling-shape miss run 8 made with `flex-none`, in the same file, on the
// same control, for the same reason: this button only exists while the account has
// NO workspace, a state no funded test account can reach.
const VARIANTS = {
  /**
   * Topbar: sits among bordered shell controls, so it stays quiet.
   *
   * `shrink-0` because this shares the topbar's flex row with the brain ring and
   * the credit chip, both of which were given `flex-none whitespace-nowrap` in
   * run 8 when they wrapped. THIS button was the sibling that fix missed: it only
   * renders while the account has NO workspace, a state no funded test account
   * can show, so four QA passes never saw it. At 390px it rendered "Create" over
   * "workspace" beside a correctly single-line "No wallet yet".
   */
  quiet:
    'surface-ring-firm h-control shrink-0 bg-surface px-3 text-[13px] font-[550] text-ink hover:bg-s2 rounded-sm max-narrow:min-h-[44px]',
  /** Empty state: the single primary action on the screen, so it leads. */
  primary:
    'h-control bg-primary px-3 text-[13px] font-[550] text-primary-foreground hover:bg-ink active:translate-y-[0.5px] rounded-sm max-narrow:min-h-[44px]',
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
          // `whitespace-nowrap`: "Create workspace" is one label, not two words to
          // be broken across lines when the row runs short.
          'flex items-center gap-2 whitespace-nowrap transition-micro disabled:opacity-45',
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
