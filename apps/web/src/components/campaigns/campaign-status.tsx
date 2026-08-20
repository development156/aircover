'use client'

import { useRouter } from 'next/navigation'
import { useTransition } from 'react'
import { toast } from 'sonner'
import { CampaignStatusSchema, type CampaignStatus } from '@sahoda/shared'

import { setCampaignStatus } from '@/app/actions/campaigns'
import { Select } from '@/components/ui/select'
import { CAMPAIGN_STATUS_LABEL } from '@/lib/campaigns/status-label'

/**
 * Moving a campaign along.
 *
 * ── A PERSON MOVES IT, AND THE SCREEN HAS TO SAY SO ──────────────────────────
 * Nothing in this product advances a campaign. No job reads these rows, so a
 * start date passing does not make a campaign active and an end date passing
 * does not finish it. That is why this is an editable control and not a computed
 * badge: a badge would imply something is keeping it current, and the customer
 * would trust a word nothing maintains.
 *
 * The options come from `CampaignStatusSchema.options`, so the four words on
 * screen are the four words the column accepts. Typing a fifth here is not
 * possible, which is the point — the screen this replaced offered "Completed",
 * a value the check constraint has never allowed.
 */
export function CampaignStatusControl({
  campaignId,
  status,
}: {
  campaignId: string
  status: CampaignStatus
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  return (
    <div className="flex items-center gap-2">
      <label htmlFor="campaign-status" className="type-sm text-muted">
        Stage
      </label>
      <Select
        id="campaign-status"
        defaultValue={status}
        disabled={pending}
        className="max-w-[180px]"
        onChange={(event) => {
          const next = event.target.value
          startTransition(async () => {
            const result = await setCampaignStatus(campaignId, next)
            if (result.ok) {
              toast.success(`Moved to ${CAMPAIGN_STATUS_LABEL[next as CampaignStatus]}`)
              router.refresh()
            } else {
              toast.error(result.message)
            }
          })
        }}
      >
        {CampaignStatusSchema.options.map((option) => (
          <option key={option} value={option}>
            {CAMPAIGN_STATUS_LABEL[option]}
          </option>
        ))}
      </Select>
    </div>
  )
}
