'use client'

import { useEffect, useRef, useState } from 'react'
import { ZoomIn, ZoomOut } from 'lucide-react'

import { Modal } from '@/components/ui/modal'
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
 * ONE REFERENCE PICTURE, LARGE, SO A CHOICE CAN BE JUDGED BEFORE IT IS SPENT.
 *
 * ── WHY THIS WAS A SEPARATE COMPONENT FROM `PictureViewer` (deleted 2026-09-05) ──
 * `PictureViewer` takes a `CanvasPicture`: a picture Sahoda ITSELF generated,
 * carrying `imageId`, `prompt`, `mode`, `referenceAssetIds`, `stampOutcome` and
 * `madeAgo` — facts about a GENERATION that produced it. A reference asset
 * (`LibraryPicture`, from `lib/studio/read.ts`) is not the output of a
 * generation at all; it is a picture already in the workspace's library, and
 * it carries none of those facts. Building a `CanvasPicture` around one would
 * mean inventing a mode, an empty reference list and a null stamp outcome for
 * a picture that never went through the pipeline those fields describe — the
 * exact kind of invented state this codebase forbids. This component takes
 * only the three fields a reference actually has, and reuses the same pure
 * zoom/pan math `PictureViewer` uses (`lib/studio/viewport.ts`) and the same
 * native-`<dialog>` `Modal`, so the two viewers behave identically without
 * sharing a prop shape that does not fit.
 */
export function ReferencePreview({
  picture,
  onClose,
}: {
  picture: { assetId: string; url: string | null; title: string | null } | null
  onClose: () => void
}) {
  const [view, setView] = useState<Viewport>(fitted)
  const frame = useRef<HTMLDivElement>(null)
  const drag = useRef<{ x: number; y: number } | null>(null)

  // Back to the fit whenever a different picture is opened.
  useEffect(() => setView(fitted()), [picture?.assetId])

  return (
    <Modal
      open={picture !== null}
      onClose={onClose}
      title={picture?.title ?? 'Reference picture'}
      className="w-[min(96vw,1100px)]"
    >
      {picture === null ? null : picture.url === null ? (
        <p className="type-sm text-muted">
          Sahoda could not read this picture's preview just now. It is still picked to match.
        </p>
      ) : (
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
              alt={picture.title ?? 'A picture in your library'}
              className={`max-h-[68vh] w-full object-contain ${isFitted(view) ? '' : 'touch-none'}`}
              style={{ transform: transformFor(view), transformOrigin: 'center' }}
              draggable={false}
            />
          </div>

          <div className="flex flex-wrap items-center gap-2" data-guide="studio-reference-zoom">
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
        </div>
      )}
    </Modal>
  )
}
