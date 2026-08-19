'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Trash2 } from 'lucide-react'
import type { AssetUsageSite } from '@sahoda/shared'

import { deleteAsset } from '@/app/actions/assets'
import type { DeleteAssetState } from '@/lib/assets/state'
import { Button } from '@/components/ui/button'
import { Modal } from '@/components/ui/modal'

import { UsageList } from './usage-list'

/**
 * Delete a library file — the control the "used in" read exists to gate.
 *
 * ── THREE OUTCOMES, THREE DIFFERENT SCREENS ──────────────────────────────────
 * REFUSED. A scheduled, publishing, published or partial post depends on this
 * file. The refusal names those posts and links to them, because "you cannot do
 * this" without "here is where to go" is a dead end. Nothing is deleted and
 * there is no override — an override is what a person clicks through when they
 * are in a hurry, which is exactly when the photo disappears off Thursday's post.
 *
 * NEEDS CONFIRM. Only unpublished posts use it. They are named, and the second
 * press is made with that list on screen. This is a warning, not a refusal: the
 * posts are still being written and their owner is allowed to change their mind.
 *
 * OK. Nothing uses it. One press, done.
 *
 * ── WHY THE FIRST PRESS ASKS THE SERVER ──────────────────────────────────────
 * The button does not know which of the three it is, and it must not guess from
 * a usage list rendered minutes ago. The first press is a real call that either
 * deletes or comes back with the reason — so the sentence a person reads is
 * always about the database as it is now, not as the page last saw it.
 */
export function AssetDeleteButton({
  assetId,
  fileName,
  onDeleted,
}: {
  assetId: string
  /** Names WHICH file — a bare "Delete" in a detail pane is not enough. */
  fileName: string
  onDeleted?: () => void
}) {
  const router = useRouter()
  const [state, setState] = useState<DeleteAssetState | null>(null)
  const [pending, startTransition] = useTransition()

  function attempt(confirmed: boolean) {
    setState(null)
    startTransition(async () => {
      const result = await deleteAsset(assetId, confirmed)
      if (result.ok) {
        onDeleted?.()
        router.refresh()
        return
      }
      setState(result)
    })
  }

  const refused = state !== null && !state.ok && state.reason === 'refused' ? state : null
  const confirming = state !== null && !state.ok && state.reason === 'needs-confirm' ? state : null
  const failed = state !== null && !state.ok && state.reason === 'failed' ? state : null

  return (
    <div className="space-y-3 text-left">
      <Button
        type="button"
        variant="destructive"
        loading={pending}
        onClick={() => attempt(false)}
        aria-label={`Delete ${fileName}`}
        data-guide="assets.delete"
      >
        <Trash2 size={14} strokeWidth={1.8} aria-hidden />
        {pending ? 'Checking where it is used…' : 'Delete file'}
      </Button>

      {refused !== null ? (
        <div role="alert" className="space-y-2">
          {/* Warn, not danger: nothing went wrong. Sahoda refused on purpose and
              the file is exactly where it was. Colouring this as an error would
              claim a failure that did not happen. */}
          <p className="rounded-input border border-warn bg-warn-bg px-3 py-2.5 text-[13px] text-warn">
            {refused.message}
          </p>
          {refused.locked.length > 0 ? (
            <>
              <p className="type-eyebrow text-muted">Used in</p>
              <UsageList sites={refused.locked} />
            </>
          ) : null}
        </div>
      ) : null}

      {failed !== null ? (
        <p
          role="alert"
          className="rounded-input border border-danger-bg bg-danger-bg px-3 py-2.5 text-[13px] text-danger"
        >
          {failed.message}
        </p>
      ) : null}

      <ConfirmDetach
        open={confirming !== null}
        message={confirming?.message ?? ''}
        sites={confirming?.detach ?? []}
        fileName={fileName}
        pending={pending}
        onCancel={() => setState(null)}
        onConfirm={() => attempt(true)}
      />
    </div>
  )
}

/**
 * A MODAL, not a drawer: the person cannot carry on with the page until they
 * answer (docs/26 §10.1). `text-left` is set here rather than inherited — a
 * `<dialog>` sits in the browser's top layer but keeps the typography of wherever
 * it was mounted, so a modal opened from a centred panel renders every label
 * centred.
 */
function ConfirmDetach({
  open,
  message,
  sites,
  fileName,
  pending,
  onCancel,
  onConfirm,
}: {
  open: boolean
  message: string
  sites: readonly AssetUsageSite[]
  fileName: string
  pending: boolean
  onCancel: () => void
  onConfirm: () => void
}) {
  return (
    <Modal
      open={open}
      onClose={onCancel}
      title={`Delete “${fileName}”?`}
      className="text-left"
      footer={
        <div className="flex flex-wrap justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onCancel} disabled={pending}>
            Keep the file
          </Button>
          <Button type="button" variant="destructive" loading={pending} onClick={onConfirm}>
            {pending ? 'Deleting…' : 'Delete and remove from those posts'}
          </Button>
        </div>
      }
    >
      <div className="space-y-3 text-left">
        <p className="text-[13px] text-ink">{message}</p>
        <p className="type-eyebrow text-muted">Loses this photo</p>
        <UsageList sites={sites} />
      </div>
    </Modal>
  )
}
