'use client'

import { LEAVE_OUT_MAX_CHARS, type ReferenceFollow } from '@sahoda/shared'

import { Input } from '@/components/ui/input'

/**
 * TWO SMALL PROMPT-LEVEL CONTROLS, AND NEITHER IS A SWITCH THE MODEL MUST OBEY.
 *
 * ── WHAT THE PROVIDER CAN ACTUALLY DO ─────────────────────────────────────
 * MEASURED against `packages/mesh/src/providers/openrouter.ts`: the images
 * request body carries exactly `model`, `prompt`, `size` and
 * `input_references`. There is no negative-prompt field and no strength
 * field, and `docs/43_Image_Models.md` documents none. So both controls
 * below shape the SENTENCE Sahoda sends (`lib/studio/prompt.ts` folds them
 * into `prompt_sent`); neither is a guarantee the model is bound to honour,
 * and every sentence a customer reads here says that plainly rather than
 * promising a switch that does not exist.
 *
 * ── WHY "FOLLOW HOW CLOSELY" CAN BE GENUINELY DISABLED ────────────────────
 * It is meaningless with no reference picked: there is nothing to follow
 * closely OR loosely. `hasReference` renders it as an unavailable control
 * with the reason stated, never a live control that quietly does nothing —
 * design-lint rule 3 forbids a coming-soon `<button disabled>`, and this is
 * the different thing that rule allows: a real control, genuinely inert for
 * a real reason, with that reason on screen.
 */

export function ComposerLeaveOut({
  value,
  onChange,
}: {
  value: string
  onChange: (next: string) => void
}) {
  return (
    <div className="flex max-w-[320px] flex-col gap-1" data-guide="studio-leave-out">
      <label htmlFor="studio-leave-out-input" className="type-sm text-muted">
        Leave out
      </label>
      <Input
        id="studio-leave-out-input"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        maxLength={LEAVE_OUT_MAX_CHARS}
        placeholder="e.g. no people, no text on the sign"
        aria-describedby="studio-leave-out-note"
      />
      <p id="studio-leave-out-note" className="type-sm text-muted">
        Sahoda asks for the picture without this. It cannot guarantee removal.
      </p>
    </div>
  )
}

const FOLLOW_OPTIONS: readonly { value: ReferenceFollow; label: string }[] = [
  { value: 'loose', label: 'Loosely inspired' },
  { value: 'balanced', label: 'Balanced' },
  { value: 'close', label: 'Closely' },
]

export function ComposerReferenceFollow({
  value,
  onChange,
  hasReference,
}: {
  value: ReferenceFollow
  onChange: (next: ReferenceFollow) => void
  hasReference: boolean
}) {
  return (
    <fieldset className="flex flex-col gap-1.5" data-guide="studio-reference-follow">
      <legend className="type-sm text-muted">Follow how closely</legend>
      <div
        role="group"
        aria-label="Follow how closely"
        className="surface-ring flex w-fit gap-1 rounded-pill bg-s2 p-1"
      >
        {FOLLOW_OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            disabled={!hasReference}
            onClick={() => onChange(option.value)}
            aria-pressed={value === option.value}
            className={`rounded-pill px-3 py-1 type-sm font-[550] transition-micro focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:pointer-events-none disabled:opacity-50 ${
              value === option.value ? 'bg-surface-3 text-ink' : 'text-muted hover:text-ink'
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>
      <span className="type-sm text-muted">
        {hasReference
          ? 'Guides the picture. It does not guarantee an exact match.'
          : 'Pick a picture to match first.'}
      </span>
    </fieldset>
  )
}
