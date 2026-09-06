'use client'

import { Lock } from 'lucide-react'
import { creditCost } from '@sahoda/shared'

import { creditWord } from '@/lib/credit-words'
import { imageActionFor, routedModels, unroutedModels, type StudioModel } from '@/lib/studio/models'

/**
 * WHICH MODEL DRAWS THE PICTURE.
 *
 * ── AN OPTION IS A CHOICE, NOT A COMPARISON TABLE ────────────────────────────
 * A founder screenshot of the composer's 380px rail showed choosing a model
 * blowing the panel apart: each card carried five facts (name, a description
 * sentence, the reference ceiling, the billing basis, the price) across four
 * models, twenty facts to make one choice. An option now shows only what a
 * person scanning the list needs to pick: its name, what it costs, and one
 * short line for when to reach for it. The reference ceiling and the billing
 * basis are real facts and are not deleted, they move into that option's own
 * `<details>` disclosure, open on demand rather than printed whether anyone
 * asked or not.
 *
 * ── AND WHAT IT UNLOCKS IS A REAL RULE, NOT A SELLING POINT ─────────────────
 * The "unlocks" line, where it survives inside a disclosure, is the same
 * number `modes.ts` enforces. If the copy and the rule ever disagree, the
 * rule wins and the copy is a lie, which is why both read from `models.ts`.
 *
 * ── THE ONES WE CANNOT REACH ARE SHOWN, AND SAY SO, ONCE ────────────────────
 * Hiding them would be tidier and would leave somebody wondering whether the
 * product can make a carousel at all. They are listed, visibly not
 * selectable, with the reason, as a span carrying a `Lock` rather than a
 * disabled button. The reason used to repeat under every one of them, three
 * copies of one sentence under a heading that already said "Not connected
 * yet". It is said once for the whole group instead.
 *
 * ── AND THE PRICE IS ON THE OPTION, BEFORE THE PRESS ────────────────────────
 * Two of the three unrouted models are held at the premium price. An option
 * that said "the dearest" and never said a number left the person to find out
 * on the wallet page, after the spend. The figure comes from the pricing file
 * through `imageActionFor`, the same function the action prices the hold
 * with, so the option and the ledger entry cannot disagree, and it is the one
 * fact that never moves into the disclosure.
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
      <legend className="type-sm text-muted">Which model should draw it?</legend>

      <ul className="flex flex-col gap-1.5">
        {available.map((model) => (
          <li key={model.id} className="flex flex-col gap-1">
            <button
              type="button"
              onClick={() => onChoose(model.id)}
              aria-pressed={modelId === model.id}
              className={`surface-ring flex w-full flex-col gap-0.5 rounded-card px-3 py-1.5 text-left transition-micro focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
                modelId === model.id ? 'bg-primary text-primary-foreground' : 'bg-s2 text-muted'
              }`}
            >
              <Option model={model} />
            </button>
            <Facts model={model} />
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
                className="surface-ring flex flex-col gap-1 rounded-card bg-s2 px-3 py-2 opacity-70"
                data-guide="studio-model-waiting"
              >
                <span className="flex flex-col gap-0.5">
                  <span className="flex items-center gap-1 type-sm font-[550]">
                    <Lock className="size-[13px]" aria-hidden />
                    {model.label}
                  </span>
                  <Option model={model} nameShown={false} />
                </span>
                <Facts model={model} />
              </li>
            ))}
          </ul>
        </div>
      )}
    </fieldset>
  )
}

/**
 * The two facts a person needs to pick between options: what it is called,
 * what it costs, and one short line for when to reach for it. Nothing else:
 * see this file's header for where everything else went.
 */
function Option({ model, nameShown = true }: { model: StudioModel; nameShown?: boolean }) {
  // Non-null for every catalogue model; the catalogue is the only source of
  // options, so the null arm is the type's, not a state a person reaches.
  const action = imageActionFor(model.id)
  const cost = action === null ? null : creditCost(action)
  return (
    <>
      <span className="flex items-baseline justify-between gap-2">
        {nameShown ? <span className="type-sm font-[550]">{model.label}</span> : null}
        {cost === null ? null : (
          <span className="type-sm font-[550]">
            Costs <span className="num">{cost}</span> {creditWord(cost)} a picture
          </span>
        )}
      </span>
      <span className="type-sm">{model.goodAt}</span>
    </>
  )
}

/**
 * The reference ceiling and the billing basis, real facts about a mode the
 * customer may never use, moved off the option into a disclosure they open
 * on demand. Rendered as a sibling of the pressable button, never nested
 * inside it: `<details>`/`<summary>` are interactive and a browser refuses to
 * nest one inside a `<button>`.
 */
function Facts({ model }: { model: StudioModel }) {
  return (
    <details className="group px-3">
      <summary className="w-fit cursor-pointer type-sm text-muted underline-offset-2 hover:text-ink">
        Details
      </summary>
      <div className="mt-1 flex flex-col gap-0.5">
        {model.unlocks === null ? null : (
          <span className="type-sm text-muted">{model.unlocks}</span>
        )}
        <span className="type-sm text-muted">{model.costNote}</span>
      </div>
    </details>
  )
}
