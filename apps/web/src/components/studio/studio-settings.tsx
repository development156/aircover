'use client'

import { ModelPicker } from '@/components/studio/model-picker'
import { ReferenceUpload } from '@/components/studio/reference-upload'
import type { StampAnchor, StampSizeStep } from '@sahoda/shared'
import type { GenerationMode } from '@sahoda/shared'
import type { LibraryRead } from '@/lib/studio/read'
import { ruleFor } from '@/lib/studio/modes'

/**
 * THE THREE CHOICES THAT CANNOT BE A PILL.
 *
 * The control row above carries the look, the size, how many and the logo. What
 * is left needs more than a word each: which model draws it (three of them, with
 * the reasons to prefer one), which pictures to match (a grid), and where a logo
 * sits on the result. Those live here, behind "More", open on demand.
 *
 * ── EVERY RULE IS ASKED OF `modes.ts`, NEVER RE-IMPLEMENTED ─────────────────
 * Whether a mode may run, how many references it takes, and the sentence when it
 * may not, all come from one module the server action asks as well. A screen
 * that offered a mode the action refuses would waste a press.
 */

/**
 * The four corners a stamp may sit in, in reading order. The values are
 * `StampAnchor`'s own strings from `@sahoda/shared` — never retyped — so a
 * choice this screen offers is always one the action's validation accepts.
 */
const ANCHOR_OPTIONS: readonly { value: StampAnchor; label: string }[] = [
  { value: 'top-left', label: 'Top left' },
  { value: 'top-right', label: 'Top right' },
  { value: 'bottom-left', label: 'Bottom left' },
  { value: 'bottom-right', label: 'Bottom right' },
]

/** The three named sizes, smallest first. Never a slider: see `StampOptionsSchema`. */
const SIZE_STEP_OPTIONS: readonly { value: StampSizeStep; label: string }[] = [
  { value: 'small', label: 'Small' },
  { value: 'medium', label: 'Medium' },
  { value: 'large', label: 'Large' },
]

const CHIP =
  'surface-ring rounded-pill px-3 py-1 type-sm transition-micro focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-50'

export function StudioSettings({
  mode,
  modelId,
  onModel,
  library,
  picked,
  onTogglePicked,
  onAddReference,
  stampEnabled,
  stampAnchor,
  onAnchor,
  stampSizeStep,
  onSizeStep,
}: {
  mode: GenerationMode
  modelId: string
  onModel: (next: string) => void
  library: LibraryRead
  picked: string[]
  onTogglePicked: (assetId: string) => void
  onAddReference: (assetId: string) => void
  stampEnabled: boolean
  stampAnchor: StampAnchor
  onAnchor: (next: StampAnchor) => void
  stampSizeStep: StampSizeStep
  onSizeStep: (next: StampSizeStep) => void
}) {
  const rule = ruleFor(mode, modelId)

  return (
    <div
      id="studio-settings"
      className="surface-ring-lift flex flex-col gap-6 rounded-card bg-surface p-5 max-narrow:p-4"
    >
      <ModelPicker modelId={modelId} onChoose={onModel} />

      {/* ── WHAT TO MATCH ──────────────────────────────────────────────────
          Shown in EVERY mode, including the one that ignores references:
          picking one MOVES you to the mode that uses it, so the choice is
          honoured rather than ignored, and hiding the control would only hide
          the shortest route to what a person meant. */}
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

        {/* THREE ANSWERS, THREE SENTENCES. A failed read is not an empty
            library, and the failed one keeps only the remedy that works
            without the read: the device. */}
        {library.status === 'unreadable' ? (
          <p
            role="status"
            className="surface-ring rounded-input bg-s2 px-3 py-2 type-sm text-muted"
          >
            Sahoda could not read your pictures just now. You can still add one from this device, or
            make one below.
          </p>
        ) : library.status === 'no-workspace' ? (
          <p
            role="status"
            className="surface-ring rounded-input bg-s2 px-3 py-2 type-sm text-muted"
          >
            There is no workspace to read pictures from, so there is nothing here to match.
          </p>
        ) : library.pictures.length === 0 ? (
          <p className="surface-ring rounded-input bg-s2 px-3 py-2 type-sm text-muted">
            You have no pictures yet. Add one from this device, or make one below, and it appears
            here to match.
          </p>
        ) : (
          <ul className="grid grid-cols-4 gap-2 narrow:grid-cols-8">
            {library.pictures.map((picture) => {
              // The POSITION, not a yes: `signReferences` sends them in pick
              // order and the first weighs most, so an order-free tick hides
              // something the model acts on.
              const at = picked.indexOf(picture.assetId)
              const on = at !== -1
              return (
                <li key={picture.assetId}>
                  <button
                    type="button"
                    onClick={() => onTogglePicked(picture.assetId)}
                    aria-pressed={on}
                    aria-label={
                      on
                        ? `${picture.title ?? 'A picture in your library'}, picked ${at + 1} of ${picked.length}`
                        : (picture.title ?? 'A picture in your library')
                    }
                    className={`surface-ring relative block w-full overflow-hidden rounded-input transition-micro focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
                      on ? 'ring-2 ring-accent' : ''
                    }`}
                  >
                    {picture.url === null ? (
                      <span className="flex aspect-square items-center justify-center bg-s2 type-meta text-muted">
                        no preview
                      </span>
                    ) : (
                      // eslint-disable-next-line @next/next/no-img-element -- as above.
                      <img
                        src={picture.url}
                        alt={picture.title ?? 'A picture in your library'}
                        className="aspect-square w-full object-cover object-top"
                      />
                    )}
                    {on ? (
                      <span className="absolute right-1 top-1 flex size-[18px] items-center justify-center rounded-full bg-primary type-meta text-primary-foreground">
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

      {/* ── WHERE THE LOGO SITS ────────────────────────────────────────────
          Whether it is stamped at all is a pill on the row above, because it is
          the half a person changes. The corner and the size are here, and both
          stay REAL controls, disabled rather than hidden once the stamp is off:
          they work, and act on the very next press that turns it back on. */}
      <fieldset className="flex flex-col gap-2">
        <legend className="type-sm text-muted">Where should your logo sit?</legend>

        <div className="flex flex-wrap gap-2" data-guide="studio-logo-corner">
          {ANCHOR_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              disabled={!stampEnabled}
              onClick={() => onAnchor(option.value)}
              aria-pressed={stampAnchor === option.value}
              className={`${CHIP} ${
                stampAnchor === option.value
                  ? 'bg-surface-3 font-[600] text-ink'
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
              onClick={() => onSizeStep(option.value)}
              aria-pressed={stampSizeStep === option.value}
              className={`${CHIP} ${
                stampSizeStep === option.value
                  ? 'bg-surface-3 font-[600] text-ink'
                  : 'bg-s2 text-muted'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>

        <p className="type-meta text-muted">
          {stampEnabled
            ? 'Sahoda keeps the unstamped original too, so this is never a one-way choice.'
            : 'This picture is drawn without your logo. Nothing already made changes, and you can turn it back on for the next one.'}
        </p>
      </fieldset>
    </div>
  )
}
