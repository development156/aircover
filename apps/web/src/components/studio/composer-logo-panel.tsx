import type { StampAnchor, StampSizeStep } from '@sahoda/shared'

import { ControlDetails } from '@/components/studio/control-details'

/**
 * WHETHER, WHERE AND HOW BIG SAHODA'S LOGO GOES ON THE PICTURE.
 *
 * Split out of `composer-panels.tsx` to keep that file under the house limit,
 * not because this control stands alone in the bar: `openPanel === 'logo'` is
 * still owned there. The controls stay exactly the compact shape they already
 * were (a two-way pill, a corner grid, a size grid); what moved is the
 * explanatory paragraph that used to print under them whichever state was
 * picked. It is now behind the single "Details" affordance in the legend, per
 * the founder's ruling: a choosing surface shows the name, explanation goes in
 * a drawer.
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

export function ComposerLogoPanel({
  stampEnabled,
  onSetStampEnabled,
  stampAnchor,
  onSetStampAnchor,
  stampSizeStep,
  onSetStampSizeStep,
}: {
  stampEnabled: boolean
  onSetStampEnabled: (next: boolean) => void
  stampAnchor: StampAnchor
  onSetStampAnchor: (next: StampAnchor) => void
  stampSizeStep: StampSizeStep
  onSetStampSizeStep: (next: StampSizeStep) => void
}) {
  return (
    <fieldset className="flex flex-col gap-2" data-guide="studio-logo">
      {/* Nested inside the legend, not beside it in a wrapping `<div>`: see
          `model-picker.tsx`'s own comment on why a `<legend>` must stay the
          fieldset's direct child to keep supplying its accessible name. */}
      <legend className="flex w-full items-center justify-between gap-2 type-sm text-muted">
        <span>Stamp your logo on this picture?</span>
        <ControlDetails
          label="Read what the logo settings mean"
          title="Stamp your logo on this picture?"
          dataGuide="studio-logo-details"
        >
          <div className="space-y-3">
            <p className="type-sm text-muted">
              Sahoda keeps the unstamped original too, so stamping is never a one-way choice.
            </p>
            <p className="type-sm text-muted">
              Leaving it off draws the picture without your logo. Nothing already made changes, and
              you can turn it back on for the next one.
            </p>
          </div>
        </ControlDetails>
      </legend>
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
              stampEnabled === option.value ? 'bg-surface-3 text-ink' : 'text-muted hover:text-ink'
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
    </fieldset>
  )
}
