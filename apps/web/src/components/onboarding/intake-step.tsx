'use client'

import { useMemo, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  assumptionNote,
  classify,
  readBack,
  withOverrides,
  type Classification,
} from '@/lib/onboarding/classify'
import {
  BUSINESS_MODELS,
  LOCALES,
  LOCALE_LABEL,
  MODEL_LABEL,
  REGIMES,
  REGIME_LABEL,
  type BusinessModel,
  type Intake,
  type Locale,
  type Regime,
} from '@/lib/onboarding/intake'

import { PickChips } from './pick-chips'

export interface IntakeStepProps {
  initialText: string
  initialOverrides: Partial<Intake>
  onContinue: (intake: Intake, text: string, overrides: Partial<Intake>) => void
}

/**
 * Screen 1 — three picks, from one sentence.
 *
 * The box is the primary input and the chips are the correction. Classification
 * runs locally on every keystroke: it costs nothing, it is the same answer every
 * time, and nobody is billed for the product working out who they are.
 *
 * Everything the classifier concluded is stated before the user commits to it,
 * and every conclusion says whether it was READ from their words or GUESSED.
 */
export function IntakeStep({ initialText, initialOverrides, onContinue }: IntakeStepProps) {
  const [text, setText] = useState(initialText)
  const [overrides, setOverrides] = useState<Partial<Intake>>(initialOverrides)

  const classification: Classification = useMemo(
    () => withOverrides(classify(text), overrides),
    [text, overrides],
  )
  const note = assumptionNote(classification)

  /**
   * ── NOTHING IS CLAIMED BEFORE THERE IS SOMETHING TO CLAIM IT FROM ──────────
   * MEASURED 2026-08-22 on a fresh account, with the box untouched: this screen
   * asserted in bold "You're a service business in everyday consumer goods and
   * services, in India." and then, one line below in grey, "We could not read
   * any of this from your words — pick below." Both sentences were on screen at
   * once, two lines apart, and the box was empty. Each of the three chip groups
   * carried a "guessed" badge next to a pre-selected chip.
   *
   * Nothing had been guessed, because nothing had been written. The classifier
   * is not at fault and is not touched — typing one sentence about a bakery
   * moves it to local_presence / food / IN and both the false line and the
   * badges correctly disappear. The fault is asserting a conclusion over an
   * empty input.
   *
   * An override counts as an answer too: someone who clears the box after
   * picking chips has still told us something, and their picks are choices
   * rather than guesses.
   *
   * ── ONLY THE ASSERTION IS SUPPRESSED. THE DISCLOSURES STAY. ────────────────
   * A first pass at this also hid the three "guessed" badges while the box was
   * empty, and `intake-step.test.tsx` caught it: "Nothing typed: all three are
   * defaults and must say so." That assertion is RIGHT. The badges are the
   * mechanism by which a default admits to being a default, and removing them
   * would have made a pre-selected chip look like a confirmed choice — trading
   * one false impression for a quieter one. What was actually wrong was the
   * BOLD SENTENCE claiming a conclusion, not the grey text admitting there
   * wasn't one.
   */
  const hasAnswered = text.trim().length > 0 || Object.keys(overrides).length > 0

  return (
    <div className="flex flex-col gap-6">
      {/* The seeded Guide tour anchors setup here. It moved from the old Spark
          form's first field to this one — same meaning, "setup starts here" —
          so the tour keeps pointing at the first thing a new user meets.
          `anchor-integrity.test.ts` fails the gate if it goes missing. */}
      <div data-guide="onboarding.start">
        <p className="text-[16px] font-bold text-ink">Tell us what you do</p>
        <p className="mt-1 text-[13px] text-muted">
          One sentence, in your own words. We read three things out of it and show you what we got.
          Change any of them.
        </p>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="intake-text">In your words</Label>
        <textarea
          id="intake-text"
          value={text}
          onChange={(event) => setText(event.target.value)}
          rows={3}
          placeholder="e.g. I run a bakery on Prabhat Road in Pune"
          className="w-full surface-ring rounded-card bg-surface p-3 text-[14px] text-ink transition-micro placeholder:text-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        />
      </div>

      <div className="rounded-card border border-line bg-s1 p-4">
        {hasAnswered ? (
          <>
            <p aria-live="polite" className="text-[15px] font-semibold text-ink">
              {readBack(classification)}
            </p>
            {note ? <p className="mt-1 text-[13px] text-muted">{note}</p> : null}
          </>
        ) : (
          // `type-body` rather than a hand-written 13px: the five literals above it
          // are grandfathered by the design-lint baseline, and adding a sixth is
          // what the ratchet exists to stop.
          <p aria-live="polite" className="type-body text-muted">
            Write a sentence above and Sahoda reads it back here. Nothing is assumed until you do.
          </p>
        )}
      </div>

      <div className="flex flex-col gap-5">
        <PickChips<BusinessModel>
          name="model"
          legend="What you are"
          options={BUSINESS_MODELS}
          labels={MODEL_LABEL}
          value={classification.intake.model}
          assumed={classification.model.basis === 'assumed'}
          onChange={(model) => setOverrides((current) => ({ ...current, model }))}
        />
        <PickChips<Regime>
          name="regime"
          legend="Your sector"
          options={REGIMES}
          labels={REGIME_LABEL}
          value={classification.intake.regime}
          assumed={classification.regime.basis === 'assumed'}
          onChange={(regime) => setOverrides((current) => ({ ...current, regime }))}
        />
        <PickChips<Locale>
          name="locale"
          legend="Where you are"
          options={LOCALES}
          labels={LOCALE_LABEL}
          value={classification.intake.locale}
          assumed={classification.locale.basis === 'assumed'}
          onChange={(locale) => setOverrides((current) => ({ ...current, locale }))}
        />
      </div>

      <div className="border-t border-line pt-4">
        <Button
          type="button"
          data-guide="onboarding.intake-continue"
          className="self-start"
          onClick={() => onContinue(classification.intake, text, overrides)}
        >
          Continue
        </Button>
      </div>
    </div>
  )
}
