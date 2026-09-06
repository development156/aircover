import type { GenerationMode, StampAnchor, StampSizeStep } from '@sahoda/shared'

import { ComposerLogoPanel } from '@/components/studio/composer-logo-panel'
import { ComposerMatchPanel } from '@/components/studio/composer-match-panel'
import { ControlDetails } from '@/components/studio/control-details'
import { ModelPicker } from '@/components/studio/model-picker'
import { aspectRatioLabel, type StudioFormat } from '@/lib/studio/formats'
import { MODE_RULES, readyModes, type ModeRule } from '@/lib/studio/modes'
import type { LibraryRead } from '@/lib/studio/read'

/**
 * WHICHEVER PILL WAS PRESSED, AND ONLY ONE AT A TIME.
 *
 * `Model`, `Approach`, `Size`, `Match` and `Logo` are summaries that open the
 * same fieldsets this bar has always used, never a second implementation of
 * them. `openPanel` (owned by `composer.tsx`) says which one is expanded;
 * this component only renders whichever that is, so the panels themselves
 * stay out of the file that owns the bar's own state.
 */

export type ComposerOpenPanel = 'model' | 'approach' | 'size' | 'match' | 'logo' | null

export function ComposerPanels({
  openPanel,
  modelId,
  onChooseModel,
  mode,
  rule,
  onChooseMode,
  formats,
  formatId,
  onChangeFormat,
  library,
  picked,
  onToggleReference,
  onAddReference,
  stampEnabled,
  onSetStampEnabled,
  stampAnchor,
  onSetStampAnchor,
  stampSizeStep,
  onSetStampSizeStep,
}: {
  openPanel: ComposerOpenPanel
  modelId: string
  onChooseModel: (next: string) => void
  mode: GenerationMode
  rule: ModeRule
  onChooseMode: (next: GenerationMode) => void
  formats: StudioFormat[]
  formatId: string
  onChangeFormat: (next: string) => void
  library: LibraryRead
  picked: string[]
  onToggleReference: (assetId: string) => void
  onAddReference: (assetId: string) => void
  stampEnabled: boolean
  onSetStampEnabled: (next: boolean) => void
  stampAnchor: StampAnchor
  onSetStampAnchor: (next: StampAnchor) => void
  stampSizeStep: StampSizeStep
  onSetStampSizeStep: (next: StampSizeStep) => void
}) {
  if (openPanel === null) return null
  const chosen = formats.find((f) => f.id === formatId) ?? null

  return (
    <div
      className="surface-ring flex flex-col gap-3 rounded-card bg-canvas p-3"
      id={`studio-panel-${openPanel}`}
    >
      {openPanel === 'model' ? <ModelPicker modelId={modelId} onChoose={onChooseModel} /> : null}

      {openPanel === 'approach' ? (
        <fieldset className="flex flex-col gap-2">
          {/* Nested inside the legend, not beside it in a wrapping `<div>`: see
              `model-picker.tsx`'s own comment on why a `<legend>` must stay the
              fieldset's direct child to keep supplying its accessible name. */}
          <legend className="flex w-full items-center justify-between gap-2 type-sm text-muted">
            <span>How should Sahoda approach it?</span>
            <ControlDetails
              label="Read what each approach does"
              title="How should Sahoda approach it?"
              dataGuide="studio-approach-details"
            >
              <ApproachReasons />
            </ControlDetails>
          </legend>
          <div className="grid gap-2 narrow:grid-cols-3 max-narrow:grid-cols-1">
            {readyModes(modelId).map((option) => (
              <button
                key={option.mode}
                type="button"
                onClick={() => onChooseMode(option.mode)}
                aria-pressed={mode === option.mode}
                className={`surface-ring rounded-card px-3 py-1.5 text-left transition-micro focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
                  mode === option.mode ? 'bg-primary text-primary-foreground' : 'bg-s2 text-muted'
                }`}
              >
                <span className="block type-sm font-[550]">{option.label}</span>
              </button>
            ))}
          </div>
        </fieldset>
      ) : null}

      {openPanel === 'size' ? (
        <label className="flex flex-col gap-1">
          <span className="type-sm text-muted">What size?</span>
          <select
            value={formatId}
            onChange={(event) => onChangeFormat(event.target.value)}
            className="surface-ring h-input w-fit rounded-sm bg-s2 px-2 type-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            data-guide="studio-format"
          >
            {formats.map((format) => (
              <option key={format.id} value={format.id}>
                {format.label} ({aspectRatioLabel(format)})
              </option>
            ))}
          </select>
          {chosen === null ? null : (
            <span className="type-sm text-muted">
              <span className="num">{chosen.width}</span> by{' '}
              <span className="num">{chosen.height}</span> pixels, for{' '}
              <span className="num">{chosen.channels.length}</span> of your channels.
            </span>
          )}
        </label>
      ) : null}

      {openPanel === 'match' ? (
        <ComposerMatchPanel
          rule={rule}
          library={library}
          picked={picked}
          onToggleReference={onToggleReference}
          onAddReference={onAddReference}
        />
      ) : null}

      {openPanel === 'logo' ? (
        <ComposerLogoPanel
          stampEnabled={stampEnabled}
          onSetStampEnabled={onSetStampEnabled}
          stampAnchor={stampAnchor}
          onSetStampAnchor={onSetStampAnchor}
          stampSizeStep={stampSizeStep}
          onSetStampSizeStep={onSetStampSizeStep}
        />
      ) : null}
    </div>
  )
}

/**
 * Every mode's "what it does" sentence, for every mode the catalogue
 * declares. `MODE_RULES` rather than `readyModes(modelId)`: the drawer is
 * reference material for the whole control, not a live reflection of what the
 * chosen model currently allows, so it says what "A set that matches" would
 * do too, even on a press where the model has taken it off the list.
 */
function ApproachReasons() {
  return (
    <dl className="space-y-3">
      {MODE_RULES.map((rule) => (
        <div key={rule.mode} className="border-t border-line-soft pt-3 first:border-t-0 first:pt-0">
          <dt className="type-sm font-[550]">{rule.label}</dt>
          <dd className="type-sm text-muted">{rule.what}</dd>
        </div>
      ))}
    </dl>
  )
}
