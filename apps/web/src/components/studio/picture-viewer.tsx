'use client'

import { useEffect, useRef, useState } from 'react'
import { Download, ZoomIn, ZoomOut } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Modal } from '@/components/ui/modal'
import type { CanvasPicture } from '@/lib/studio/canvas'
import { savePicture } from '@/lib/studio/save-picture'
import {
  canZoomIn,
  canZoomOut,
  describeZoom,
  fitted,
  isFitted,
  panBy,
  transformFor,
  zoomBy,
  type Viewport,
} from '@/lib/studio/viewport'

/**
 * ONE PICTURE, AS LARGE AS THE SCREEN ALLOWS, WITH A WAY TO KEEP IT.
 *
 * ── ON THE NATIVE DIALOG, DELIBERATELY ──────────────────────────────────────
 * `ui/modal.tsx` is built on `<dialog showModal()>`, which puts the panel in the
 * browser's TOP LAYER. That matters here beyond focus trapping: this app has a
 * standing trap where a `backdrop-filter` ancestor becomes the containing block
 * for `position: fixed`, so a hand-rolled overlay can silently lay out as a
 * strip instead of the viewport (apps/web/CLAUDE.md). The top layer has no
 * containing block to be captured by, so this cannot happen to it.
 *
 * ── SAVING LIVES IN `lib/studio/save-picture.ts` ────────────────────────────
 * Two places offer Save now, this and the canvas, and a second copy of the
 * cross-origin reasoning is a second place for it to drift. A fetch that fails
 * says so here and offers the one remedy that works.
 */
export function PictureViewer({
  picture,
  onClose,
}: {
  picture: CanvasPicture | null
  onClose: () => void
}) {
  const [saving, setSaving] = useState(false)
  const [failed, setFailed] = useState(false)

  /**
   * ── WHY A VIEWER NEEDS A ZOOM AT ALL ──────────────────────────────────────
   * This screen exists so somebody can decide whether a picture is good enough
   * to publish. A story is 1080 by 1920 and lands here a few hundred pixels
   * tall, which is enough to see that a picture arrived and not enough to see
   * that a hand has six fingers or a sign says something a model invented.
   */
  const [view, setView] = useState<Viewport>(fitted)
  const frame = useRef<HTMLDivElement>(null)
  const drag = useRef<{ x: number; y: number } | null>(null)

  // Back to the fit whenever a different picture is opened. Carrying a zoom
  // across would drop somebody into the corner of a picture they have not seen.
  useEffect(() => setView(fitted()), [picture?.imageId])

  async function save() {
    if (picture === null) return
    setFailed(false)
    setSaving(true)
    const ok = await savePicture(picture)
    setFailed(!ok)
    setSaving(false)
  }

  return (
    <Modal
      open={picture !== null}
      onClose={onClose}
      title={picture === null ? 'Your picture' : picture.prompt}
      className="w-[min(96vw,1100px)]"
    >
      {picture === null ? null : (
        <div className="flex flex-col gap-3">
          <div
            ref={frame}
            className={`surface-ring max-h-[68vh] overflow-hidden rounded-card bg-s2 ${
              isFitted(view) ? '' : 'cursor-grab'
            }`}
            onPointerDown={(event) => {
              if (isFitted(view)) return
              event.currentTarget.setPointerCapture(event.pointerId)
              drag.current = { x: event.clientX, y: event.clientY }
            }}
            onPointerMove={(event) => {
              const from = drag.current
              const box = frame.current
              if (from === null || box === null) return
              const rect = box.getBoundingClientRect()
              if (rect.width === 0 || rect.height === 0) return
              // In FRACTIONS of the frame, which is the unit the viewport keeps,
              // so the same gesture means the same thing at any window size.
              setView((current) =>
                panBy(
                  current,
                  (event.clientX - from.x) / rect.width,
                  (event.clientY - from.y) / rect.height,
                ),
              )
              drag.current = { x: event.clientX, y: event.clientY }
            }}
            onPointerUp={() => {
              drag.current = null
            }}
            onPointerCancel={() => {
              drag.current = null
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- a short-lived
                signed URL from a private bucket cannot be optimised by next/image
                without proxying the credential. */}
            <img
              src={picture.url}
              alt={picture.prompt}
              width={picture.width ?? undefined}
              height={picture.height ?? undefined}
              // `touch-none` only once there is somewhere to pan: taking the
              // gesture at the fit would stop the dialog scrolling on a phone
              // for no gain.
              className={`max-h-[68vh] w-full object-contain ${isFitted(view) ? '' : 'touch-none'}`}
              style={{ transform: transformFor(view), transformOrigin: 'center' }}
              draggable={false}
            />
          </div>

          <div className="flex flex-wrap items-center gap-2" data-guide="studio-zoom">
            <button
              type="button"
              onClick={() => setView(zoomBy(view, -1))}
              aria-label="Show less of the picture at a time"
              aria-disabled={!canZoomOut(view)}
              className={`surface-ring flex size-[36px] items-center justify-center rounded-card bg-s2 text-muted transition-micro focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
                canZoomOut(view) ? '' : 'opacity-50'
              }`}
            >
              <ZoomOut className="size-[16px]" aria-hidden />
            </button>
            <button
              type="button"
              onClick={() => setView(fitted())}
              // The label says what pressing it DOES, not only where you are. A
              // percentage alone is a readout, and a person who has zoomed in and
              // cannot see a way back is worse off than with no zoom at all.
              aria-label={`Zoomed to ${describeZoom(view)}. Fit the whole picture again`}
              className="surface-ring h-[36px] rounded-card bg-s2 px-2 type-sm text-muted transition-micro hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              <span className="num">{describeZoom(view)}</span>
            </button>
            <button
              type="button"
              onClick={() => setView(zoomBy(view, 1))}
              aria-label="Look closer at the picture"
              aria-disabled={!canZoomIn(view)}
              className={`surface-ring flex size-[36px] items-center justify-center rounded-card bg-s2 text-muted transition-micro focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
                canZoomIn(view) ? '' : 'opacity-50'
              }`}
            >
              <ZoomIn className="size-[16px]" aria-hidden />
            </button>
            {isFitted(view) ? null : (
              <span className="type-sm text-muted">Drag the picture to move around it.</span>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={save} loading={saving} data-guide="studio-download">
              <Download className="size-[15px]" aria-hidden />
              Save to your computer
            </Button>
            {picture.width === null || picture.height === null ? null : (
              <span className="type-sm text-muted">
                <span className="num">{picture.width}</span> by{' '}
                <span className="num">{picture.height}</span> pixels
              </span>
            )}
          </div>

          {failed ? (
            <p role="alert" className="type-sm text-ink">
              Sahoda could not save this picture just now. The picture is safe in your library, and
              reopening this screen gives the link another try.
            </p>
          ) : null}
        </div>
      )}
    </Modal>
  )
}
