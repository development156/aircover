'use client'

import { useRouter } from 'next/navigation'
import { useTransition } from 'react'
import { X } from 'lucide-react'
import { toast } from 'sonner'

import { removePostFromCampaign } from '@/app/actions/campaigns'

/**
 * Take one post out of this campaign.
 *
 * ── THIS IS NOT A DELETE, AND EVERY WORD ON IT SAYS SO ───────────────────────
 * It removes a membership row. The post keeps its body, its variants, its
 * schedule and its place in the planner. "Remove from campaign" rather than
 * "Remove", and the toast repeats it — because the thing people fear when they
 * click an × next to their own writing is losing the writing.
 *
 * ── WHY IT IS ALLOWED STANDING SPACE IN A ROW ────────────────────────────────
 * The system's rule is that a DESTRUCTIVE action never gets permanent real
 * estate in a list row — the failure it names is `/posts`, where `Delete` was
 * the only action on every card. This is neither: it destroys nothing, it is
 * undone by adding the post back, and it is the row's SECOND affordance. The
 * row's primary one is the post title, which opens the post.
 *
 * It is a `ghost` for the same reason: the quietest control the system has, so
 * scanning the grid never lands on it first.
 */
export function RemovePostButton({
  campaignId,
  postId,
  postTitle,
}: {
  campaignId: string
  postId: string
  postTitle: string
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  return (
    <button
      type="button"
      disabled={pending}
      // Named for what it does to the CAMPAIGN, not to the post. A screen reader
      // announcing "Remove Diwali teaser" would describe a delete.
      aria-label={`Remove ${postTitle} from this campaign, keeping the post`}
      onClick={() => {
        startTransition(async () => {
          const result = await removePostFromCampaign(campaignId, postId)
          if (result.ok) {
            toast.success('Removed from the campaign. The post is still in Posts')
            router.refresh()
          } else {
            toast.error(result.message)
          }
        })
      }}
      className="inline-flex size-7 items-center justify-center rounded-sm text-muted transition-micro hover:bg-surface-3 hover:text-ink disabled:opacity-45 max-narrow:min-h-[44px] max-narrow:min-w-[44px]"
    >
      <X aria-hidden size={15} strokeWidth={2} />
    </button>
  )
}
