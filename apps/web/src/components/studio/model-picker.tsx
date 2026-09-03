'use client'

import { Lock } from 'lucide-react'
import { creditCost } from '@sahoda/shared'

import { creditWord } from '@/lib/credit-words'
import { imageActionFor, routedModels, unroutedModels, type StudioModel } from '@/lib/studio/models'

/**
 * WHICH MODEL DRAWS THE PICTURE.
 *
 * ── A MODEL NAME IS NOT A CAPABILITY ────────────────────────────────────────
 * "gemini-2.5-flash-image" tells a shop owner nothing. What they need to decide
 * between is: which is cheap while I am still working out what I want, which
 * one handles words in a picture, and which one can draw a set that matches.
 * So each card leads with what it is GOOD AT, in their terms, and the id is not
 * on the screen at all.
 *
 * ── AND WHAT IT UNLOCKS IS A REAL RULE, NOT A SELLING POINT ─────────────────
 * The "unlocks" line is the same number `modes.ts` enforces. Choosing a model
 * that draws ten pictures in one call is what turns "a set that matches" from
 * refused into offered, and turns the reference limit from three into fourteen.
 * If the copy and the rule ever disagree, the rule wins and the copy is a lie,
 * which is why both read from `models.ts`.
 *
 * ── THE ONES WE CANNOT REACH ARE SHOWN, AND SAY SO ──────────────────────────
 * Hiding them would be tidier and would leave somebody wondering whether the
 * product can make a carousel at all. They are listed, visibly not selectable,
 * with the reason. That is the difference between a door and a wall.
 *
 * ── AND THE PRICE IS ON THE CARD, BEFORE THE PRESS ──────────────────────────
 * Two of the three are held at the premium price. A card that said "the
 * dearest" and never said a number left the person to find out on the wallet
 * page, after the spend. The figure comes from the pricing file through
 * `imageActionFor`, the same function the action prices the hold with, so the
 * card and the ledger entry cannot disagree.
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

      <ul className="grid gap-2 narrow:grid-cols-2 max-narrow:grid-cols-1">
        {available.map((model) => (
          <li key={model.id}>
            <button
              type="button"
              onClick={() => onChoose(model.id)}
              aria-pressed={modelId === model.id}
              className={`surface-ring flex h-full w-full flex-col gap-1 rounded-card px-3 py-2 text-left transition-micro focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
                modelId === model.id ? 'bg-primary text-primary-foreground' : 'bg-s2 text-muted'
              }`}
            >
              <Card model={model} />
            </button>
          </li>
        ))}
      </ul>

      {waiting.length === 0 ? null : (
        <div className="flex flex-col gap-2">
          <span className="type-sm text-muted">Not connected yet</span>
          <ul className="grid gap-2 narrow:grid-cols-2 max-narrow:grid-cols-1">
            {waiting.map((model) => (
              <li
                key={model.id}
                className="surface-ring flex flex-col gap-1 rounded-card bg-s2 px-3 py-2 opacity-70"
                data-guide="studio-model-waiting"
              >
                <Card model={model} />
                <span className="flex items-center gap-1 type-sm text-muted">
                  <Lock className="size-[13px]" aria-hidden />
                  Built and waiting on the connection being switched on.
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </fieldset>
  )
}

function Card({ model }: { model: StudioModel }) {
  // Non-null for every catalogue model; the catalogue is the only source of
  // cards, so the null arm is the type's, not a state a person reaches.
  const action = imageActionFor(model.id)
  const cost = action === null ? null : creditCost(action)
  return (
    <>
      <span className="type-sm font-[550]">{model.label}</span>
      <span className="type-sm">{model.goodAt}</span>
      {model.unlocks === null ? null : <span className="type-sm font-[550]">{model.unlocks}</span>}
      <span className="type-sm">{model.costNote}</span>
      {cost === null ? null : (
        <span className="type-sm font-[550]">
          Costs <span className="num">{cost}</span> {creditWord(cost)} a picture
        </span>
      )}
    </>
  )
}
