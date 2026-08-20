'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { toast } from 'sonner'

import { deleteCampaign } from '@/app/actions/campaigns'
import { Button } from '@/components/ui/button'
import { Modal } from '@/components/ui/modal'

/**
 * Deleting a campaign.
 *
 * ── IT IS BELOW EVERYTHING, IN ITS OWN ROW ───────────────────────────────────
 * A destructive action does not share a strip with the ordinary ones and never
 * gets standing space beside the primary. It sits under the grid, behind a
 * confirmation, in the quietest treatment the system has above plain text.
 *
 * ── THE CONFIRMATION'S JOB IS TO SAY WHAT SURVIVES ───────────────────────────
 * "Delete campaign" reads, to most people, like it might take the posts with it.
 * It does not: `campaign_posts` cascades and `posts` is not touched by either
 * drop. That sentence is the whole reason this modal exists — a confirmation
 * that only asks "are you sure?" adds a click and no information.
 */
export function DeleteCampaignButton({
  campaignId,
  campaignName,
}: {
  campaignId: string
  campaignName: string
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()

  return (
    <div className="flex justify-end border-t border-line-soft pt-4">
      <Button variant="ghost" size="sm" onClick={() => setOpen(true)}>
        Delete campaign
      </Button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={`Delete “${campaignName}”?`}
        description="The campaign and its grouping go. Every post in it stays exactly as it is, in Posts and in the planner."
      >
        <div className="flex items-center justify-end gap-2">
          <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
            Keep it
          </Button>
          <Button
            type="button"
            variant="destructive"
            loading={pending}
            onClick={() => {
              startTransition(async () => {
                const result = await deleteCampaign(campaignId)
                if (result.ok) {
                  toast.success('Campaign deleted — the posts are still there')
                  router.push('/campaigns')
                } else {
                  toast.error(result.message)
                }
              })
            }}
          >
            Delete campaign
          </Button>
        </div>
      </Modal>
    </div>
  )
}
