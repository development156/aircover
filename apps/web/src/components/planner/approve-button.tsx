'use client'

import { useTransition } from 'react'
import { toast } from 'sonner'
import type { PostStatus } from '@sahoda/shared'

import { approvePost } from '@/app/actions/planner'
import { Button } from '@/components/ui/button'
import { canApprove } from '@/lib/planner/transitions'

export interface ApproveButtonProps {
  postId: string
  status: PostStatus
}

/**
 * The seeded `approve.first_tour` targets this control (`planner.approve`).
 * Approved shows as a disabled "Approved" — state, not a dead button; statuses
 * past approval (scheduled/publishing/…) render nothing, because offering an
 * approve affordance on a post the pipeline owns would be a lie.
 */
export function ApproveButton({ postId, status }: ApproveButtonProps) {
  const [pending, startTransition] = useTransition()

  if (!canApprove(status) && status !== 'approved') return null

  const approved = status === 'approved'

  function run() {
    startTransition(async () => {
      const result = await approvePost(postId)
      if (result.ok) toast.success('Post approved')
      else toast.error(result.message)
    })
  }

  return (
    <Button
      size="sm"
      variant="secondary"
      data-guide="planner.approve"
      onClick={run}
      disabled={approved || pending}
      loading={pending}
    >
      {approved ? 'Approved' : 'Approve'}
    </Button>
  )
}
