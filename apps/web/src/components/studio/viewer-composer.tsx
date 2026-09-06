'use client'

import { useState } from 'react'
import type { BrandSignal } from '@sahoda/shared'

import { recordRemixLineage } from '@/app/actions/studio-remix'
import { Composer, type ComposerInitialValues } from '@/components/studio/composer'
import { ViewerRemixToggle } from '@/components/studio/viewer-remix-toggle'
import type { QueueGenerationState } from '@/app/actions/studio'
import type { StudioFormat } from '@/lib/studio/formats'
import type { LibraryRead } from '@/lib/studio/read'

/**
 * THE COMPOSER, PREFILLED, WITH THE REMIX LINK LIVING BESIDE IT AND NOT INSIDE IT.
 *
 * `composer.tsx`'s own header says why `onGenerated` exists: so a caller can
 * act on a successful press "without this file needing to know that linking
 * exists". This is that caller. It never reshapes `queueGeneration` or
 * `use-composer.ts` — the toggle's own state lives here, and a successful
 * press is followed by ONE update of a column that already exists on the new
 * row, through `recordRemixLineage`, which itself degrades honestly if the
 * column turns out not to be reachable after all.
 */
export function ViewerComposer({
  formats,
  library,
  signals,
  initialValues,
  sourceGenerationId,
  remixLocked,
}: {
  formats: StudioFormat[]
  library: LibraryRead
  signals: BrandSignal[] | null
  initialValues: ComposerInitialValues
  /** The generation this screen is showing, to link a remix back to. */
  sourceGenerationId: string
  /** True when `remixed_from` could not be confirmed reachable. See header. */
  remixLocked: boolean
}) {
  const [remixOn, setRemixOn] = useState(true)
  const [linkNote, setLinkNote] = useState<string | null>(null)

  function handleGenerated(result: Extract<QueueGenerationState, { ok: true }>) {
    setLinkNote(null)
    if (remixLocked || !remixOn) return
    void recordRemixLineage(result.generationId, sourceGenerationId).then((state) => {
      if (!state.ok) setLinkNote(state.message)
    })
  }

  return (
    <div className="flex flex-col gap-2">
      <Composer
        formats={formats}
        library={library}
        signals={signals}
        initialValues={initialValues}
        onGenerated={handleGenerated}
        extraControls={
          <ViewerRemixToggle locked={remixLocked} on={remixOn} onChange={setRemixOn} />
        }
      />
      {linkNote === null ? null : (
        <p role="alert" className="type-sm text-muted">
          {linkNote}
        </p>
      )}
    </div>
  )
}
