'use client'

import { useTransition } from 'react'
import { toast } from 'sonner'
import type { PostStatus } from '@sahoda/shared'

import { approvePost } from '@/app/actions/planner'
import { Button } from '@/components/ui/button'
import { approveMessage } from '@/lib/approvals/state'
import { canApprove } from '@/lib/planner/transitions'

export interface ApproveButtonProps {
  postId: string
  status: PostStatus
}

/**
 * The seeded `approve.first_tour` targets this control (`planner.approve`).
 * Statuses past approval (scheduled/publishing/…) render nothing, because
 * offering an approve affordance on a post the pipeline owns would be a lie.
 *
 * ── APPROVED IS NOT A DISABLED BUTTON ANY MORE ───────────────────────────────
 * It used to be `<Button disabled>Approved</Button>`, defended in this comment
 * as "state, not a dead button". docs/26 §10.2 rules the opposite way, and the
 * reasoning is about what a screen reader does rather than about what it looks
 * like: a disabled button is still ANNOUNCED as a button. The reader is offered
 * an action, takes it, and nothing happens — which reads as a broken app.
 *
 * And it was redundant twice over. MEASURED on the /planner list: an approved
 * row rendered the word "Approved" TWICE — once in the status chip, once in the
 * dead button beside it. The chip is the state. So this now renders NOTHING for
 * an approved post, which is also what every later status already did.
 */
export function ApproveButton({ postId, status }: ApproveButtonProps) {
  const [pending, startTransition] = useTransition()

  // Approved and beyond: the status chip in the row already says so, and there
  // is no action left to offer.
  if (!canApprove(status)) return null

  function run() {
    startTransition(async () => {
      const result = await approvePost(postId)
      // The status the RPC handed back decides the sentence: a dated post comes
      // back `scheduled` and the toast must say so, because "Post approved" over
      // a post that will now go out on its own under-claims what just happened.
      if (result.ok) toast.success(approveMessage(result.status))
      else toast.error(result.message)
    })
  }

  return (
    <Button
      size="sm"
      variant="secondary"
      data-guide="planner.approve"
      onClick={run}
      disabled={pending}
      loading={pending}
    >
      Approve
    </Button>
  )
}
