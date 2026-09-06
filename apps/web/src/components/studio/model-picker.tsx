'use client'

import { Lock } from 'lucide-react'
import { creditCost } from '@sahoda/shared'

import { ControlDetails } from '@/components/studio/control-details'
import { creditWord } from '@/lib/credit-words'
import {
  STUDIO_MODELS,
  describeModelBlockFor,
  imageActionFor,
  routedModels,
  unroutedModels,
  type StudioModel,
} from '@/lib/studio/models'

/**
 * WHICH MODEL DRAWS THE PICTURE.
 *
 * ── SUPERSEDES THE PER-OPTION `<details>` CUT ────────────────────────────────
 * The previous pass took a five-fact card down to three (name, price, a short
 * "good at" line) plus a per-option `<details>` disclosure for the reference
 * ceiling and the billing basis. The founder's ruling on the two demo
 * screenshots supersedes that MECHANISM, not its direction: `/connections`
 * answers "what does this do" in a right-hand drawer, opened once per tile,
 * never inline and never as a per-row toggle that still prints a paragraph the
 * moment it opens. This file now matches that: the list is a short set of
 * names and prices, dropdown-plain, and every reason to pick one — what it is
 * good at, what it unlocks, how it is billed, why the locked ones are locked —
 * lives behind ONE "Details" button next to the legend, in `ControlDetails`'s
 * drawer.
 *
 * ── AND WHAT IT UNLOCKS IS A REAL RULE, NOT A SELLING POINT ─────────────────
 * The "unlocks" line, inside the drawer, is the same number `modes.ts`
 * enforces. If the copy and the rule ever disagree, the rule wins and the copy
 * is a lie, which is why both read from `models.ts`.
 *
 * ── THE ONES WE CANNOT REACH ARE SHOWN, AND SAY SO, ONCE ────────────────────
 * Hiding them would be tidier and would leave somebody wondering whether the
 * product can make a carousel at all. They are listed, visibly not
 * selectable, with the reason, as a span carrying a `Lock` rather than a
 * disabled button. The reason is said once for the whole group, and again,
 * per model, inside the drawer.
 *
 * ── AND THE PRICE NEVER MOVES OFF THE CHOOSING SURFACE ──────────────────────
 * Two of the three unrouted models are held at the premium price. An option
 * that said "the dearest" and never said a number left the person to find out
 * on the wallet page, after the spend. The figure comes from the pricing file
 * through `imageActionFor`, the same function the action prices the hold
 * with, so the option and the ledger entry cannot disagree, and it is the one
 * fact that stays on the option whatever else moves into the drawer.
 */
export function ModelPicker({
  modelId,
  onChoose,
}: {
  modelId: string
  onChoose: (id: string) => void
}) {
  const available = routedModels()
  const waiting = unroutedModels()

  return (
    <fieldset className="flex flex-col gap-2" data-guide="studio-model">
      {/* The `ControlDetails` trigger is nested INSIDE the legend, not beside it
          in a wrapping `<div>`: a `<legend>` is only recognised as the
          fieldset's own caption, and only supplies its accessible name, when
          it is the fieldset's direct child. A button is phrasing content, so
          nesting it here is valid HTML and keeps that link intact. */}
      <legend className="flex w-full items-center justify-between gap-2 type-sm text-muted">
        <span>Which model should draw it?</span>
        <ControlDetails
          label="Read what each model does"
          title="Which model should draw it?"
          dataGuide="studio-model-details"
        >
          <ModelReasons />
        </ControlDetails>
      </legend>

      <ul className="flex flex-col gap-1.5">
        {available.map((model) => (
          <li key={model.id}>
            <button
              type="button"
              onClick={() => onChoose(model.id)}
              aria-pressed={modelId === model.id}
              className={`surface-ring flex w-full items-baseline justify-between gap-2 rounded-card px-3 py-1.5 text-left transition-micro focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
                modelId === model.id ? 'bg-primary text-primary-foreground' : 'bg-s2 text-muted'
              }`}
            >
              <Price model={model} />
            </button>
          </li>
        ))}
      </ul>

      {waiting.length === 0 ? null : (
        <div className="flex flex-col gap-1.5">
          <span className="type-sm text-muted">Not connected yet</span>
          <p className="type-sm text-muted">
            Everything these models need is built. They are waiting on the connection being switched
            on.
          </p>
          <ul className="flex flex-col gap-1.5">
            {waiting.map((model) => (
              <li
                key={model.id}
                className="surface-ring flex items-baseline justify-between gap-2 rounded-card bg-s2 px-3 py-2 opacity-70"
                data-guide="studio-model-waiting"
              >
                <span className="flex items-center gap-1 type-sm font-[550]">
                  <Lock className="size-[13px]" aria-hidden />
                  {model.label}
                </span>
                <Price model={model} nameShown={false} />
              </li>
            ))}
          </ul>
        </div>
      )}
    </fieldset>
  )
}

/**
 * The two facts a person needs at the point of choosing: what it is called,
 * what it costs. Nothing else: see this file's header for where everything
 * else went.
 */
function Price({ model, nameShown = true }: { model: StudioModel; nameShown?: boolean }) {
  // Non-null for every catalogue model; the catalogue is the only source of
  // options, so the null arm is the type's, not a state a person reaches.
  const action = imageActionFor(model.id)
  const cost = action === null ? null : creditCost(action)
  return (
    <>
      {nameShown ? <span className="type-sm font-[550]">{model.label}</span> : null}
      {cost === null ? null : (
        <span className="type-sm font-[550]">
          Costs <span className="num">{cost}</span> {creditWord(cost)} a picture
        </span>
      )}
    </>
  )
}

/**
 * Every reason to pick one model over another, for every model in the
 * catalogue, routed or not. This is the whole of what used to be printed
 * inline the moment the pill opened; it now prints only when somebody asks
 * for it.
 */
function ModelReasons() {
  return (
    <dl className="space-y-4">
      {STUDIO_MODELS.map((model, index) => (
        <div
          key={model.id}
          className={index === 0 ? 'space-y-1' : 'space-y-1 border-t border-line-soft pt-4'}
        >
          <dt className="type-sm font-[550]">{model.label}</dt>
          <dd className="type-sm text-muted">{model.goodAt}</dd>
          {model.unlocks === null ? null : <dd className="type-sm text-muted">{model.unlocks}</dd>}
          <dd className="type-sm text-muted">{model.costNote}</dd>
          {describeModelBlockFor(model) === null ? null : (
            <dd className="type-sm text-muted">{describeModelBlockFor(model)}</dd>
          )}
        </div>
      ))}
    </dl>
  )
}
