'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import type { BrandSignal, GenerationMode, StampAnchor, StampSizeStep } from '@sahoda/shared'

import type { QueueGenerationState } from '@/app/actions/studio'
import { creditWord } from '@/lib/credit-words'
import { ComposerChips } from '@/components/studio/composer-chips'
import { ComposerNotBuilt } from '@/components/studio/composer-not-built'
import { ComposerPanels } from '@/components/studio/composer-panels'
import { ComposerPickedReferences } from '@/components/studio/composer-picked-references'
import { ComposerPrompt } from '@/components/studio/composer-prompt'
import { ComposerStarters } from '@/components/studio/composer-starters'
import { ComposerWillSend } from '@/components/studio/composer-will-send'
import { PromptRefineControl } from '@/components/studio/prompt-refine-control'
import { ReferencePreview } from '@/components/studio/reference-preview'
import { useComposer } from '@/components/studio/use-composer'
import type { StudioFormat } from '@/lib/studio/formats'
import type { LibraryRead } from '@/lib/studio/read'

/**
 * THE COMPOSER. A BAR, NOT A CARD, AND NOW A COMPONENT OF ITS OWN.
 *
 * ── WHY THIS FILE EXISTS ────────────────────────────────────────────────
 * Extracted out of `studio-workbench.tsx` (formerly ~1,400 lines) so a second
 * screen can mount the exact same bar: the wall (`studio-workbench.tsx`),
 * where a press starts a picture from nothing, and the viewer
 * (`/studio/<id>`, a later pass), where a press starts from an EXISTING
 * generation's own prompt, model, mode, format, count and references, and
 * may record the result as a version of that picture. Every rule this bar
 * enforces — the reference ceiling, which modes exist, the price — still
 * comes from `lib/studio/modes.ts` and `lib/studio/models.ts` alone, asked by
 * `use-composer.ts`, which owns every piece of state and the press itself.
 * This file is arrangement only: which sub-component gets which value from
 * that hook.
 *
 * ── THE PROP INTERFACE, AND WHY IT IS SHAPED THIS WAY ────────────────────
 * `initialValues` is the one thing that differs between the two callers: the
 * wall omits it (every control starts at its own built-in default, the same
 * defaults this bar has always had), and the viewer will pass the fields a
 * `CanvasPicture` actually recorded. It is a plain data object rather than a
 * second set of controlled props, so a caller that does not care about most
 * of the fields does not have to pass defaults for them — every field is
 * independently optional and missing means "use the bar's own default,"
 * never "leave it unset."
 *
 * `onGenerated` is the hook the viewer needs and the wall does not: this bar
 * ALWAYS refreshes the router itself on a successful press (every caller
 * needs the newest data, true before the extraction too), and `onGenerated`
 * fires with the same result BEFORE that refresh, so a caller can act on it
 * — the viewer links the new press to the picture it started from — without
 * this file needing to know that linking exists. Absent, the bar behaves
 * exactly as it always has.
 *
 * `extraControls`, rendered at the end of the chip row, is the slot for a
 * control that belongs to a caller and not to the bar itself — the viewer's
 * remix toggle is the first one expected to use it.
 *
 * ── WHAT DOES NOT LIVE HERE ANY MORE ─────────────────────────────────────
 * `activeId`, the canvas, `viewing`/`drawing`, the version toggle and the
 * "use these words again" / "use it in a post" actions were all about a
 * SPECIFIC already-made picture, which is the viewer's screen and not the
 * composer's. They left with "the canvas" section when the wall was
 * rebuilt; nothing here replaces them, and pass 2 owns that ground.
 */

/**
 * Seeds every control. Every field is independently optional: the wall omits
 * this prop entirely and gets the bar's own built-in defaults (empty prompt,
 * on brand, the first format, the default model, one try, today's stamp
 * default); the viewer hands in only what a `CanvasPicture` actually
 * recorded.
 */
export interface ComposerInitialValues {
  wanted?: string
  mode?: GenerationMode
  formatId?: string
  modelId?: string
  referenceAssetIds?: string[]
  count?: number
  stamp?: { enabled: boolean; anchor: StampAnchor; sizeStep: StampSizeStep }
}

export interface ComposerProps {
  formats: StudioFormat[]
  /** Pictures already in this workspace, offered as things to match, or which of two reasons there are none. */
  library: LibraryRead
  /** What the Brand Brain will add to this request, shown before the press. Null means the read failed. */
  signals: BrandSignal[] | null
  /** Spendable credits, or null when the read did not produce a number. Null renders as nothing, never as zero. */
  balance: number | null
  /** See this file's header. Omitted for a bar that starts from nothing. */
  initialValues?: ComposerInitialValues
  /** Fires with a successful press's own result, before this bar refreshes the router. See this file's header. */
  onGenerated?: (result: Extract<QueueGenerationState, { ok: true }>) => void
  /**
   * Mirrors `busy` to a caller that wants to react to it outside this
   * component — the wall's own first-run message ("Sahoda is generating your
   * first image now") depends on it, and the composer is the only thing that
   * knows when a press is in flight.
   */
  onBusyChange?: (busy: boolean) => void
  /** Rendered at the end of the chip row. See this file's header. */
  extraControls?: React.ReactNode
}

export function Composer({
  formats,
  library,
  signals,
  balance,
  initialValues,
  onGenerated,
  onBusyChange,
  extraControls,
}: ComposerProps) {
  const c = useComposer({ formats, library, initialValues, onGenerated })

  // `onBusyChange` mirrors `busy` for a caller outside this tree, whose
  // render already depends on it — done as a plain effect rather than inside
  // the hook, so `use-composer.ts` never needs to know a caller exists.
  useEffect(() => {
    onBusyChange?.(c.busy)
  }, [c.busy, onBusyChange])

  return (
    <div className="mx-auto flex w-full max-w-[820px] flex-col gap-3">
      {balance === null ? null : (
        <div className="flex justify-end">
          <span className="type-sm text-muted" data-guide="studio-balance">
            <span className="num">{balance.toLocaleString()}</span> {creditWord(balance)} left
          </span>
        </div>
      )}

      <div
        className="surface-ring flex flex-col gap-3 rounded-xl bg-surface p-3 shadow-lg"
        data-guide="studio-bar"
        data-surface="inverse"
      >
        <ComposerPrompt
          wanted={c.wanted}
          onChange={c.setWanted}
          mode={c.mode}
          ready={c.ready}
          busy={c.busy}
          total={c.total}
          onSubmit={c.generate}
        />

        <PromptRefineControl wanted={c.wanted} onChange={c.setWanted} />

        <ComposerStarters visible={c.wanted.trim() === ''} onPick={c.setWanted} />

        <ComposerPickedReferences
          picked={c.picked}
          libraryPictures={c.libraryPictures}
          maxReferences={c.rule.maxReferences}
          onOpen={c.setViewingReference}
          onRemove={c.toggleReference}
          onAdd={c.addReference}
        />

        <ComposerChips
          pickedCount={c.picked.length}
          modelLabel={c.modelLabel}
          approachLabel={c.rule.label}
          sizeLabel={c.sizeLabel}
          count={c.count}
          stampEnabled={c.stampEnabled}
          openPanel={c.openPanel}
          onTogglePanel={c.togglePanel}
          onStepCount={c.setCount}
          extraControls={extraControls}
        />

        {c.count === 1 ? null : (
          <p className="type-sm text-muted">
            <span className="num">{c.count}</span> different pictures from the same description, so
            you can pick. They will not match each other.
          </p>
        )}

        {c.blocked === null ? null : (
          <p role="status" className="surface-ring rounded-card bg-s2 px-3 py-2 type-sm text-muted">
            {c.blocked}
          </p>
        )}

        <ComposerPanels
          openPanel={c.openPanel}
          modelId={c.modelId}
          onChooseModel={c.chooseModel}
          mode={c.mode}
          rule={c.rule}
          onChooseMode={c.chooseMode}
          formats={formats}
          formatId={c.formatId}
          onChangeFormat={c.setFormatId}
          library={library}
          picked={c.picked}
          onToggleReference={c.toggleReference}
          onAddReference={c.addReference}
          stampEnabled={c.stampEnabled}
          onSetStampEnabled={c.setStampEnabled}
          stampAnchor={c.stampAnchor}
          onSetStampAnchor={c.setStampAnchor}
          stampSizeStep={c.stampSizeStep}
          onSetStampSizeStep={c.setStampSizeStep}
        />
      </div>

      <ComposerWillSend signals={signals} />
      <ComposerNotBuilt />

      {c.note === null ? null : (
        <p role="alert" className="type-sm text-ink">
          {c.note}{' '}
          {c.short ? (
            <Link
              href="/wallet"
              className="font-[600] underline underline-offset-2 transition-micro hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              Top up your wallet
            </Link>
          ) : null}
        </p>
      )}

      <ReferencePreview picture={c.viewingReference} onClose={() => c.setViewingReference(null)} />
    </div>
  )
}
