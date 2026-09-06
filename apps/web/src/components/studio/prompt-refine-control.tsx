'use client'

import { useRef, useState } from 'react'
import { RotateCcw, Sparkles } from 'lucide-react'
import { creditCost, type PromptRefineSettings } from '@sahoda/shared'

import { refineStudioPrompt, type RefinePromptState } from '@/app/actions/studio-prompt'
import { creditWord } from '@/lib/credit-words'
import { describeInsufficient } from '@/lib/studio/refusal-copy'

/**
 * REWRITE WHAT SOMEBODY TYPED, IN TERMS OF HOW THE PICTURE SHOULD BE MADE.
 *
 * ── PRICED, LIKE `Generate Image` ─────────────────────────────────────────────
 * `creditCost('studio_prompt_refine')` is the same call `studio-workbench.tsx`
 * makes for the draw button, so a price change in `pricing.config.json` moves
 * both without either being edited.
 *
 * ── THE SAME DOUBLE-PRESS GUARD AS GENERATE IMAGE ─────────────────────────────
 * A plain `busy` boolean set from `useState` updates on the NEXT render, so it
 * cannot on its own stop a second click landing inside the SAME tick as the
 * first. `pressLocked` is a plain ref, read and written synchronously, exactly
 * the pattern `studio-workbench.tsx` documents on its own Generate Image button
 * — that guard is what actually stops the second spend; `busy` only drives the
 * visible "working" state.
 *
 * ── PLAIN STATE, NOT `useTransition` ─────────────────────────────────────────
 * This press calls `onChange`, which sets state on the PARENT (`wanted`), from
 * inside the async callback. Wrapping that cross-component update in a
 * transition left `isPending` observably stuck on `true` forever in exactly
 * this shape of test (fresh mount, dispatch, resolve, assert unlocked) once
 * enough other component instances had mounted and unmounted earlier in the
 * same suite — reproducible, and never once with plain `useState` in its
 * place. Plain state doesn't need React to reconcile a pending transition
 * against a fiber a cross-component update may have already moved past, so
 * there is nothing here for that class of bug to happen to.
 *
 * ── REVERSIBLE, ALWAYS ─────────────────────────────────────────────────────────
 * `original` is kept in this component's own state, never in the parent's
 * `wanted` field, so accepting a refinement can always be undone back to the
 * exact words somebody typed, even after the refined text itself has been
 * edited further.
 *
 * ── `settings`, AND WHY THIS COMPONENT DOES NOT COMPUTE IT ──────────────────
 * `use-composer.ts`'s `refineSettings` is the single place the bar's own
 * mode, shape, stamp, exclusion text and reference-follow choice are turned
 * into `PromptRefineSettings` — the same shape a fresh diffusion generation
 * will use. This component only carries it through to the server action,
 * so the two can never compute the shape or the corner differently.
 */

const REFINE_COST = creditCost('studio_prompt_refine')

export function PromptRefineControl({
  wanted,
  onChange,
  settings,
}: {
  wanted: string
  onChange: (next: string) => void
  settings: PromptRefineSettings
}) {
  const [busy, setBusy] = useState(false)
  const pressLocked = useRef(false)
  const [result, setResult] = useState<RefinePromptState | null>(null)
  const [original, setOriginal] = useState<string | null>(null)

  const ready = wanted.trim().length >= 3

  async function refine() {
    if (pressLocked.current) return
    pressLocked.current = true
    setBusy(true)
    const asked = wanted
    try {
      const state = await refineStudioPrompt({ wanted: asked, settings })
      setResult(state)
      if (state.ok) {
        setOriginal(asked)
        onChange(state.refined)
      }
    } finally {
      pressLocked.current = false
      setBusy(false)
    }
  }

  function revert() {
    if (original === null) return
    onChange(original)
    setOriginal(null)
    setResult(null)
  }

  return (
    <div className="flex flex-col gap-1.5" data-guide="studio-refine">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={refine}
          disabled={!ready || busy}
          aria-busy={busy || undefined}
          data-guide="studio-refine-button"
          className="surface-ring flex h-control items-center gap-1.5 rounded-pill bg-s2 px-3 type-sm font-[550] text-ink transition-micro hover:bg-surface-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:pointer-events-none disabled:opacity-50"
        >
          <Sparkles className="size-[13px]" aria-hidden />
          {busy ? 'Rewriting your words…' : 'Rewrite for the model'}
          <span className="num type-sm opacity-75">
            {REFINE_COST} {creditWord(REFINE_COST)}
          </span>
        </button>

        {original === null ? null : (
          <button
            type="button"
            onClick={revert}
            data-guide="studio-refine-revert"
            className="surface-ring flex h-control items-center gap-1.5 rounded-pill bg-s2 px-3 type-sm font-[550] text-muted transition-micro hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            <RotateCcw className="size-[13px]" aria-hidden />
            Get your own words back
          </button>
        )}
      </div>

      {result === null ? null : result.ok ? (
        <p role="status" className="type-sm text-muted" data-guide="studio-refine-note">
          <span className="font-[550] text-ink">{result.headline}.</span> {result.body}
        </p>
      ) : (
        <p role="alert" className="type-sm text-ink" data-guide="studio-refine-note">
          {result.insufficient
            ? describeInsufficient({ required: result.required, available: result.available })
            : result.message}
        </p>
      )}
    </div>
  )
}
