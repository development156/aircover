'use client'

import { useState } from 'react'
import type { BrandSignal } from '@sahoda/shared'

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
              formats={formats}
              library={library}
              signals={signals}
              balance={balance}
              initialValues={initialValues}
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
            <PictureActions picture={picture} />
          </div>
        </div>
      </aside>
    </div>
  )
}

function Divider() {
  return <div aria-hidden className="h-px bg-line" />
}
