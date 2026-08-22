'use client'

import { useEffect, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Modal } from '@/components/ui/modal'
import type { FocalPoint } from '@/lib/media/crop-geometry'
import { normaliseFocal } from '@/lib/media/crop-geometry'
import type { CropOfferView } from '@/lib/media/offer-state'

import { CropFocal } from './crop-focal'
import { CropOutcomes } from './crop-outcomes'
import { CropPreview } from './crop-preview'

/**
 * THE OFFER, ON SCREEN. Shown after a refusal, never instead of one.
 *
 * ── DECLINING IS THE DEFAULT AND COSTS NOTHING ──────────────────────────────
 * Closing this dialog calls no action at all. The refusal that opened it is
 * still on the page, still says why the file was refused, and still describes a
 * post with nothing attached — because nothing was ever written. That is not a
 * path that had to be built; it is the absence of the one that was.
 *
 * ── AND ACCEPTING IS EXPLICIT ───────────────────────────────────────────────
 * One button, named for what it does, and it is the only thing in this lane that
 * writes. Until it is pressed the crop exists as four numbers.
 *
 * ── WHAT THE PERSON IS DECIDING ABOUT ───────────────────────────────────────
 * A photograph, so the picture is the biggest thing here and the reasoning sits
 * under it. The channel rows are the part that stops this being a leap of faith:
 * they name which rule forced the crop and which channels the crop does not help.
 */
export function CropOfferDialog({
  offer,
  open,
  onClose,
  onAccept,
  pending,
  localSrc,
  error,
}: {
  offer: CropOfferView
  open: boolean
  onClose: () => void
  onAccept: (focal: FocalPoint) => void
  pending: boolean
  /**
   * A blob URL for a file the browser already holds. Used in preference to
   * `offer.previewUrl`, which is null on the upload path — the bytes never
   * reached storage, precisely because the file was refused.
   */
  localSrc: string | null
  /** A failure from the accept itself. Shown here rather than behind the dialog. */
  error: string | null
}) {
  const [focal, setFocal] = useState<FocalPoint>(offer.focal)

  // A new offer is a new photograph. Keeping the previous focal point would
  // apply one picture's subject position to another's.
  const key = `${offer.assetId ?? 'upload'}:${offer.original.width}x${offer.original.height}`
  const [offerKey, setOfferKey] = useState(key)
  if (offerKey !== key) {
    setOfferKey(key)
    setFocal(offer.focal)
  }

  // Escape and the backdrop both route through `onClose`, so a dialog dismissed
  // any way at all is a decline — there is no path that closes it and writes.
  useEffect(() => {
    if (!open) setFocal(offer.focal)
  }, [open, offer.focal])

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Crop this photo to fit?"
      description="Sahoda can cut this photo to a shape the channels accept. Nothing is saved until you accept."
      footer={
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={pending}>
            Keep it as it is
          </Button>
          <Button onClick={() => onAccept(normaliseFocal(focal))} loading={pending}>
            {pending ? 'Cropping…' : 'Use this crop'}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <CropPreview
          offer={offer}
          focal={focal}
          src={localSrc ?? offer.previewUrl}
          onPick={pending ? undefined : setFocal}
        />

        <div className="space-y-2">
          <p className="type-sm text-muted">
            Point at the subject, or use the sliders. The original is kept, uncropped.
          </p>
          <CropFocal offer={offer} focal={focal} onChange={setFocal} disabled={pending} />
        </div>

        <CropOutcomes outcomes={offer.outcomes} />

        {error === null ? null : (
          <p
            role="alert"
            className="rounded-input border border-danger-bg bg-danger-bg px-3 py-2.5 type-body text-danger"
          >
            {error}
          </p>
        )}
      </div>
    </Modal>
  )
}
