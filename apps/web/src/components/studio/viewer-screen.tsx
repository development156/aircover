'use client'

import dynamic from 'next/dynamic'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import type { BrandSignal } from '@sahoda/shared'

import { DiscardGeneration } from '@/components/studio/discard-generation'
import { PictureActions } from '@/components/studio/picture-actions'
import { ViewerComposer } from '@/components/studio/viewer-composer'
import { ViewerDetails } from '@/components/studio/viewer-details'
import { ViewerHeader } from '@/components/studio/viewer-header'
import { ViewerLogoSection } from '@/components/studio/viewer-logo-section'
import { ViewerPromptPanel } from '@/components/studio/viewer-prompt-panel'
import { ViewerVersionsStrip } from '@/components/studio/viewer-versions-strip'
import type { CanvasPicture } from '@/lib/studio/canvas'
import type { StudioFormat } from '@/lib/studio/formats'
import type { LibraryRead } from '@/lib/studio/read'
import type { ComposerInitialValues } from '@/components/studio/composer'
import type { ViewerVersions } from '@/lib/studio/viewer-read'

/**
 * Loaded on the press and not before: the canvas, its tools and its object
 * model are the heaviest thing on this route, and most visits never draw.
 * The wall did the same when it owned this modal.
 */
const DrawModal = dynamic(() =>
  import('@/components/studio/draw-modal').then((mod) => mod.DrawModal),
)

/**
 * THE VIEWER. FULL-BLEED, DARK, AND ONE PICTURE LARGE.
 *
 * `data-surface="inverse"` on the root re-resolves every token for the whole
 * subtree — canvas, surface, ink, line — the same scope the rail and topbar
 * already use, rather than a one-off dark patch that drifts from the real
 * dark ladder. See `Viewer.dc.html`'s own annotation for why this is a
 * SEPARATE screen from the wall: making wants controls in reach, looking
 * wants the picture as large as the screen allows, and stacked on one page
 * neither got what it wanted.
 */
export function ViewerScreen({
  picture,
  modelId,
  referenceAssetIds,
  versions,
  formats,
  library,
  signals,
  balance,
  initialValues,
  sourceGenerationId,
  remixLocked,
}: {
  picture: CanvasPicture
  modelId: string | null
  referenceAssetIds: string[]
  versions: ViewerVersions
  formats: StudioFormat[]
  library: LibraryRead
  signals: BrandSignal[] | null
  balance: number | null
  initialValues: ComposerInitialValues
  sourceGenerationId: string
  remixLocked: boolean
}) {
  const [showing, setShowing] = useState<'stamped' | 'original'>(
    picture.stampOutcome === 'stamped' && picture.stampedUrl !== null ? 'stamped' : 'original',
  )
  const shownUrl = showing === 'stamped' ? (picture.stampedUrl ?? picture.url) : picture.url

  const libraryPictures = library.status === 'ok' ? library.pictures : []

  /**
   * ── DRAW ON IT, AND THEN CHANGE IT ─────────────────────────────────────────
   * "Draw on it" was reachable from the wall until the two-screen split on
   * 2026-09-05 and then from nowhere: `PictureActions` only offers it when
   * handed `onDraw`, and nothing handed it. It lives here now, because marking
   * a picture up is something you do to the one you are looking at.
   *
   * Offered only when the picture's size is recorded, since the canvas needs
   * real pixels to draw at. A saved mark-up lands in the library as an asset,
   * and the composer below is re-seeded to Edit with that asset picked: a
   * marked picture left unselected is a press that led nowhere.
   */
  const router = useRouter()
  const [drawing, setDrawing] = useState(false)
  const [drawnAssetId, setDrawnAssetId] = useState<string | null>(null)
  const canDraw = picture.width !== null && picture.height !== null
  const composerValues: ComposerInitialValues =
    drawnAssetId === null
      ? initialValues
      : { ...initialValues, mode: 'edit', referenceAssetIds: [drawnAssetId] }

  return (
    <div
      data-surface="inverse"
      className="-mx-page -mt-page flex min-h-[calc(100vh-4rem)] flex-col bg-canvas max-narrow:-mx-page-mobile max-narrow:-mt-page-mobile narrow:flex-row"
    >
      <div className="flex min-w-0 flex-1 flex-col">
        <ViewerHeader prompt={picture.prompt} madeAgo={picture.madeAgo} versions={versions} />

        <div className="flex flex-1 items-center justify-center px-7 pb-3">
          <div className="max-h-[68vh] max-w-full overflow-hidden rounded-card shadow-lg">
            {/* eslint-disable-next-line @next/next/no-img-element -- a
                short-lived signed URL from a private bucket cannot be
                optimised by next/image without proxying the credential. */}
            <img
              src={shownUrl}
              alt={showing === 'stamped' ? `${picture.prompt}, with your logo` : picture.prompt}
              width={picture.width ?? undefined}
              height={picture.height ?? undefined}
              className="max-h-[68vh] max-w-full rounded-card object-contain"
              data-guide="studio-canvas"
            />
          </div>
        </div>

        <span className="sr-only" data-guide="studio-canvas-meta">
          {picture.width === null || picture.height === null
            ? 'Size not recorded'
            : `${picture.width} by ${picture.height} pixels`}
        </span>

        <ViewerVersionsStrip versions={versions} />
      </div>

      <aside className="surface-ring w-full shrink-0 overflow-y-auto bg-surface p-5 narrow:w-[380px]">
        <div className="flex flex-col gap-4">
          <ViewerPromptPanel
            prompt={picture.prompt}
            referenceAssetIds={referenceAssetIds}
            libraryPictures={libraryPictures}
          />

          <Divider />

          <div className="flex flex-col gap-2">
            <span className="type-eyebrow text-muted">Change it</span>
            <ViewerComposer
              key={drawnAssetId ?? 'as-generated'}
              formats={formats}
              library={library}
              signals={signals}
              balance={balance}
              initialValues={composerValues}
              sourceGenerationId={sourceGenerationId}
              remixLocked={remixLocked}
            />
          </div>

          <Divider />

          <ViewerDetails picture={picture} modelId={modelId} />

          <Divider />

          <ViewerLogoSection picture={picture} showing={showing} onShowingChange={setShowing} />

          <Divider />

          <div className="flex flex-col gap-2">
            <span className="type-eyebrow text-muted">Do something with it</span>
            <PictureActions
              picture={picture}
              onDraw={canDraw ? () => setDrawing(true) : undefined}
            />
            {/* Removing the request was reachable from the history list until
                the wall replaced it on 2026-09-05. This screen IS that record,
                so it goes here, and the viewer leaves once the record is gone:
                a reload of this route would be a 404 wearing a picture. */}
            <DiscardGeneration
              generationId={sourceGenerationId}
              prompt={picture.prompt}
              onRemoved={() => router.push('/studio')}
            />
          </div>
        </div>
      </aside>

      {canDraw ? (
        <DrawModal
          open={drawing}
          onClose={() => setDrawing(false)}
          picture={{
            url: picture.url,
            width: picture.width as number,
            height: picture.height as number,
            prompt: picture.prompt,
          }}
          onSaved={(assetId) => {
            setDrawing(false)
            setDrawnAssetId(assetId)
            // The new asset is on the server; the library prop is not until
            // this re-reads it, and the picked reference renders from that.
            router.refresh()
          }}
        />
      ) : null}
    </div>
  )
}

function Divider() {
  return <div aria-hidden className="h-px bg-line" />
}
