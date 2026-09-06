'use client'

import { useRef, useState, useTransition } from 'react'
import { Send, Undo2 } from 'lucide-react'
import { toast } from 'sonner'
import type { PostStatus } from '@sahoda/shared'

import { returnToDraft, sendForReview } from '@/app/actions/posts-review'
import { SendBackForm } from '@/components/approvals/send-back-form'
import { Button } from '@/components/ui/button'

export interface ReviewActionsProps {
  postId: string
  status: PostStatus
}

const SUBMITTABLE: ReadonlySet<PostStatus> = new Set<PostStatus>(['idea', 'draft'])
const RETURNABLE: ReadonlySet<PostStatus> = new Set<PostStatus>(['review', 'approved', 'scheduled'])

/**
 * The review round trip on a planner row (F-06): a draft can be SENT FOR
 * REVIEW, and a post in review, approved or booked can be SENT BACK with a
 * note. Each is one RPC that leaves a `post_approvals` row; the role check
 * lives in the database, so a viewer gets the refusal sentence, not silence.
 *
 * Nothing for `publishing` and beyond: the pipeline owns those, and offering
 * a send-back on a post that is already going out would be a lie.
 */
export function ReviewActions({ postId, status }: ReviewActionsProps) {
  const [pending, startTransition] = useTransition()
  const [returning, setReturning] = useState(false)
  const sendBackButton = useRef<HTMLButtonElement>(null)

  if (SUBMITTABLE.has(status)) {
    return (
      <Button
        size="sm"
        variant="ghost"
        onClick={() =>
          startTransition(async () => {
            const result = await sendForReview(postId)
            if (result.ok) toast.success('Sent for review.')
            else toast.error(result.message)
          })
        }
        disabled={pending}
        loading={pending}
      >
        <Send size={13} strokeWidth={2} aria-hidden />
        Send for review
      </Button>
    )
  }

  if (!RETURNABLE.has(status)) return null

  async function sendBack(reason: string): Promise<string | null> {
    const result = await returnToDraft(postId, reason)
    if (!result.ok) return result.message
    setReturning(false)
    toast.success('Sent back to draft with your note.')
    return null
  }

  function closeForm() {
    setReturning(false)
    requestAnimationFrame(() => sendBackButton.current?.focus())
  }

  if (returning) {
    return (
      <div className="w-full min-w-[16rem]">
        <SendBackForm subject="this post" onSubmit={sendBack} onCancel={closeForm} />
      </div>
    )
  }

  return (
    <Button ref={sendBackButton} size="sm" variant="ghost" onClick={() => setReturning(true)}>
      <Undo2 size={13} strokeWidth={2} aria-hidden />
      Send back
    </Button>
  )
}
