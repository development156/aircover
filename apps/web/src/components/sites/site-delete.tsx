'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'

import { deleteSite } from '@/app/actions/site-delete'
import { Button } from '@/components/ui/button'
import { Modal } from '@/components/ui/modal'

/**
 * The way out of a website you did not want.
 *
 * ── WHY THE ABSENCE OF THIS WAS A DEFECT AND NOT A MISSING FEATURE ───────────
 * The plan allowance counts every `sites` row, drafts included, and correctly:
 * `sites.status` never leaves 'draft'. With no delete anywhere in the product,
 * a Starter customer's FIRST generation was also their last. A draft they
 * disliked was indistinguishable from one they were happy with, the slot never
 * freed, and the only remedy the screen could offer was a bigger plan.
 *
 * ── IT ASKS ONCE, AND SAYS WHAT IS ACTUALLY LOST ─────────────────────────────
 * There is no trash behind this. The site, its pages and its sections go, and
 * that is stated BEFORE the press rather than discovered after it. The one thing
 * a person would reasonably fear losing is their enquiries, and those SURVIVE:
 * leads keep their rows with `site_id` set null. Saying so is the difference
 * between a confident press and a person who keeps a site they do not want
 * because they are not sure what deleting it takes with it.
 */
export function SiteDelete({ siteId, siteName }: { siteId: string; siteName: string }) {
  const router = useRouter()
  const [asking, setAsking] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function confirm() {
    setFailure(null)
    startTransition(async () => {
      const result = await deleteSite(siteId)
      if (!result.ok) {
        // The modal STAYS OPEN on a failure. Closing it would leave the refusal
        // nowhere to be read, and the site is still there either way.
        setFailure(result.message)
        return
      }
      setAsking(false)
      router.refresh()
    })
  }

  return (
    <>
      <Button type="button" variant="secondary" onClick={() => setAsking(true)}>
        Delete this website
      </Button>

      <Modal
        open={asking}
        onClose={() => setAsking(false)}
        title="Delete this website?"
        className="text-left"
        footer={
          <div className="flex flex-wrap justify-end gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setAsking(false)}
              disabled={pending}
            >
              Keep it
            </Button>
            <Button type="button" variant="destructive" loading={pending} onClick={confirm}>
              {pending ? 'Deleting…' : 'Delete it for good'}
            </Button>
          </div>
        }
      >
        <p className="type-sm text-ink-body">
          This deletes “{siteName}” and every page in it for good. Sahoda cannot bring it back, and
          generating another one costs credits.
        </p>
        <p className="type-sm mt-2 text-ink-body">
          Enquiries people already sent you are kept. Deleting this frees the website slot on your
          plan.
        </p>
        {failure === null ? null : (
          <p role="alert" className="type-sm mt-3 text-danger">
            {failure}
          </p>
        )}
      </Modal>
    </>
  )
}
