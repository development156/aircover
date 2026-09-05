import type { GenerationMode, StampAnchor, StampSizeStep } from '@sahoda/shared'

import { ModelPicker } from '@/components/studio/model-picker'
import { ReferenceUpload } from '@/components/studio/reference-upload'
import { aspectRatioLabel, type StudioFormat } from '@/lib/studio/formats'
import { readyModes, type ModeRule } from '@/lib/studio/modes'
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

const ANCHOR_OPTIONS: readonly { value: StampAnchor; label: string }[] = [
  { value: 'top-left', label: 'Top left' },
  { value: 'top-right', label: 'Top right' },
  { value: 'bottom-left', label: 'Bottom left' },
  { value: 'bottom-right', label: 'Bottom right' },
]

/** The three named sizes, smallest first. Never a slider: see `StampOptionsSchema`'s own header. */
const SIZE_STEP_OPTIONS: readonly { value: StampSizeStep; label: string }[] = [
  { value: 'small', label: 'Small' },
  { value: 'medium', label: 'Medium' },
  { value: 'large', label: 'Large' },
]

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
          <legend className="type-sm text-muted">How should Sahoda approach it?</legend>
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
                <span className="block type-sm">{option.what}</span>
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
        <fieldset className="flex flex-col gap-2" data-guide="studio-references">
          <legend className="type-sm text-muted">
            {rule.maxReferences === 0
              ? 'Picking a picture here moves you to Match a picture.'
              : rule.minReferences > 0
                ? 'Which picture should Sahoda match?'
                : 'Anything Sahoda should match? (optional)'}
          </legend>

          <ReferenceUpload
            disabled={rule.maxReferences > 0 && picked.length >= rule.maxReferences}
            onAdded={onAddReference}
          />

          {library.status === 'unreadable' ? (
            <p
              role="status"
              className="surface-ring rounded-card bg-s2 px-3 py-2 type-sm text-muted"
            >
              Sahoda could not read your pictures just now. You can still add one from this device,
              or make one below.
            </p>
          ) : library.status === 'no-workspace' ? (
            <p
              role="status"
              className="surface-ring rounded-card bg-s2 px-3 py-2 type-sm text-muted"
            >
              There is no workspace to read pictures from, so there is nothing here to match.
            </p>
          ) : library.pictures.length === 0 ? (
            <p className="surface-ring rounded-card bg-s2 px-3 py-2 type-sm text-muted">
              You have no pictures yet. Add one from this device, or make one below, and it appears
              here to match.
            </p>
          ) : (
            <ul className="grid grid-cols-6 gap-1.5">
              {library.pictures.map((picture) => {
                const at = picked.indexOf(picture.assetId)
                const on = at !== -1
                return (
                  <li key={picture.assetId}>
                    <button
                      type="button"
                      onClick={() => onToggleReference(picture.assetId)}
                      aria-pressed={on}
                      aria-label={
                        on
                          ? `${picture.title ?? 'A picture in your library'}, picked ${at + 1} of ${picked.length}`
                          : (picture.title ?? 'A picture in your library')
                      }
                      className={`surface-ring relative block w-full overflow-hidden rounded-card transition-micro focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
                        on ? 'ring-2 ring-accent' : ''
                      }`}
                    >
                      {picture.url === null ? (
                        <span className="flex aspect-square items-center justify-center bg-s2 type-sm text-muted">
                          no preview
                        </span>
                      ) : (
                        // eslint-disable-next-line @next/next/no-img-element -- a
                        // short-lived signed URL from a private bucket cannot be
                        // optimised without proxying the credential.
                        <img
                          src={picture.url}
                          alt={picture.title ?? 'A picture in your library'}
                          className="aspect-square w-full object-cover object-top"
                        />
                      )}
                      {on ? (
                        <span className="absolute right-1 top-1 flex size-[18px] items-center justify-center rounded-full bg-primary type-sm text-primary-foreground">
                          <span className="num">{at + 1}</span>
                        </span>
                      ) : null}
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </fieldset>
      ) : null}

      {openPanel === 'logo' ? (
        <fieldset className="flex flex-col gap-2" data-guide="studio-logo">
          <legend className="type-sm text-muted">Stamp your logo on this picture?</legend>
          <div
            role="group"
            aria-label="Stamp your logo on this picture"
            className="surface-ring flex w-fit gap-1 rounded-pill bg-s2 p-1"
          >
            {(
              [
                { value: true, label: 'Stamp it' },
                { value: false, label: 'Leave it off' },
              ] as const
            ).map((option) => (
              <button
                key={String(option.value)}
                type="button"
                onClick={() => onSetStampEnabled(option.value)}
                aria-pressed={stampEnabled === option.value}
                className={`rounded-pill px-3 py-1 type-sm font-[550] transition-micro focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
                  stampEnabled === option.value
                    ? 'bg-surface-3 text-ink'
                    : 'text-muted hover:text-ink'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap gap-2" data-guide="studio-logo-corner">
            {ANCHOR_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                disabled={!stampEnabled}
                onClick={() => onSetStampAnchor(option.value)}
                aria-pressed={stampAnchor === option.value}
                className={`surface-ring rounded-card px-3 py-1 type-sm transition-micro focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-50 ${
                  stampAnchor === option.value
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-s2 text-muted'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap gap-2" data-guide="studio-logo-size">
            {SIZE_STEP_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                disabled={!stampEnabled}
                onClick={() => onSetStampSizeStep(option.value)}
                aria-pressed={stampSizeStep === option.value}
                className={`surface-ring rounded-card px-3 py-1 type-sm transition-micro focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-50 ${
                  stampSizeStep === option.value
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-s2 text-muted'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>

          <p className="type-sm text-muted">
            {stampEnabled
              ? 'Sahoda keeps the unstamped original too, so this is never a one-way choice.'
              : 'This picture is drawn without your logo. Nothing already made changes, and you can turn it back on for the next one.'}
          </p>
        </fieldset>
      ) : null}
    </div>
  )
}
