'use client'

import Link from 'next/link'
import { useState, useTransition } from 'react'
import { Sparkles } from 'lucide-react'
import { creditCost } from '@sahoda/shared'

import { Button } from '@/components/ui/button'
import { rewriteCaption } from '@/app/actions/posts-ai'
import { creditWord } from '@/lib/credit-words'

import { InlineError } from './inline-error'
import { PendingLines } from './pending-lines'

/**
 * The four tone modes, in the order a writer meets them.
 *
 * `polish` first because it is the one most people want and the least
 * opinionated: fix my writing, leave my voice alone. `creative` last because it
 * changes the most.
 *
 * The values are the contract's own instruction strings. The LABELS are not:
 * `docs/44` lists "enhance" among the AI-tell words this product does not use,
 * so nothing here is called an enhancement.
 */
const MODES = [
  { value: 'polish', label: 'Polish', detail: 'Grammar and clarity, your voice untouched.' },
  { value: 'professional', label: 'Professional', detail: 'Measured and precise.' },
  { value: 'friendly', label: 'Friendly', detail: 'Warm, the way you would say it.' },
  { value: 'creative', label: 'Creative', detail: 'More vivid, same facts.' },
] as const

/** Matches `CaptionRewriteInputSchema`'s own cap, so the refusal is local and honest. */
const MAX_CHARS = 8_000

const PENDING_LINES = [
  'Sending your copy to the model…',
  'Waiting on the improved version…',
  'Still waiting. You are not charged if this fails.',
] as const

type Failure =
  | { kind: 'message'; message: string }
  | { kind: 'insufficient'; required: number; available: number }

export interface ImproveCopyProps {
  /** The box this acts on, named the way a person would say it. */
  target: string
  body: string
  /** Called only when the writer presses "Use this". Never on arrival. */
  onAccept: (text: string) => void
}

/**
 * IMPROVE THIS COPY, IN A TONE YOU PICK.
 *
 * ── IT SUGGESTS, IT DOES NOT REPLACE ─────────────────────────────────────────
 * The result arrives BESIDE the writer's words and stays there until they press
 * "Use this". That is the founder's own ruling, recorded in `REQUESTS.md` §19
 * when the same question was put about the onboarding fields: suggest-and-accept
 * over silent rewriting, because a product that swaps a person's sentence for a
 * model's and keeps calling it theirs is quoting our words back as their own.
 *
 * The composer is the strongest case for that rule rather than the weakest. This
 * is a whole caption about a real business, in the owner's voice, and it is
 * about to go to their customers. `InlineRewrite` splices a SELECTION straight
 * in, which is defensible for a phrase the writer highlighted; a whole body is
 * not the same act.
 *
 * ── WHAT THE MODES ARE ALLOWED TO CHANGE ─────────────────────────────────────
 * How it reads. Never what it says. Every directive in
 * `packages/mesh/src/tasks/caption-rewrite.ts` carries `MEANING_RULE` — keep
 * every fact, claim, number, name and offer, invent nothing, remove nothing, fix
 * the grammar — and a test asserts that no mode has lost it.
 *
 * ── AND ACCEPTING IS ONE UNDO STEP ───────────────────────────────────────────
 * "Use this" writes through the same `onBodyChange` a keystroke does, and it
 * moves more than one character, so `useTextHistory` records it as its own step.
 * A writer who accepts and then changes their mind presses Undo once and has
 * their own words back, caret and all. That is why there is no "are you sure".
 */
export function ImproveCopy({ target, body, onAccept }: ImproveCopyProps) {
  const [pending, startTransition] = useTransition()
  const [failure, setFailure] = useState<Failure | null>(null)
  const [suggestion, setSuggestion] = useState<string | null>(null)

  const length = Array.from(body).length
  const cost = creditCost('caption_rewrite')

  // Nothing to improve, and nothing paid for is waiting to be read. The offer is
  // gated on having copy; everything REPORTING on a rewrite already charged for
  // is not, which is why the two conditions are separate.
  if (length === 0 && suggestion === null && failure === null && !pending) return null

  function run(mode: (typeof MODES)[number]['value']) {
    setFailure(null)
    setSuggestion(null)
    startTransition(async () => {
      const result = await rewriteCaption(body, mode)
      if (result.ok) {
        setSuggestion(result.text)
        return
      }
      setFailure(
        result.insufficient
          ? { kind: 'insufficient', required: result.required, available: result.available }
          : { kind: 'message', message: result.message },
      )
    })
  }

  return (
    <div className="surface-ring space-y-2 rounded-sm bg-s2 p-3" data-improve-copy>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="type-sm flex items-center gap-1.5 font-[550] text-ink">
          {/* Sparkles, which is this product's established glyph for a model
              call. A pencil is what manual editing looks like everywhere else in
              the app, and using it here would say the opposite of what happens. */}
          <Sparkles size={14} className="text-accent" aria-hidden />
          Improve this copy
        </span>
        <span className="type-meta text-muted">
          <span className="tabular-nums">{cost}</span> {creditWord(cost)} each
        </span>
      </div>

      {length > MAX_CHARS ? (
        /* The claim is exact: it is THIS copy that is too long for the button,
           not the post that is too long to write. Nothing is blocked except the
           one paid action, and the number is the real limit rather than a
           rounded one. */
        <p className="type-meta text-muted">
          This copy is <span className="tabular-nums">{length.toLocaleString('en-IN')}</span>{' '}
          characters, past the{' '}
          <span className="tabular-nums">{MAX_CHARS.toLocaleString('en-IN')}</span> Sahoda can
          improve in one go. Every channel&rsquo;s own limit is well below that.
        </p>
      ) : pending ? (
        <PendingLines lines={PENDING_LINES} />
      ) : (
        <>
          <div className="flex flex-wrap gap-1.5">
            {MODES.map((mode) => (
              <Button
                key={mode.value}
                variant="secondary"
                size="sm"
                aria-label={`Improve ${target}, ${mode.label.toLowerCase()}`}
                title={mode.detail}
                disabled={length === 0}
                onClick={() => run(mode.value)}
              >
                {mode.label}
              </Button>
            ))}
          </div>
          <p className="type-meta text-muted">
            Sahoda keeps your facts and fixes the writing. You decide whether to use it.
          </p>
        </>
      )}

      {suggestion !== null ? (
        <div className="surface-ring space-y-2 rounded-sm bg-surface p-3" data-improve-suggestion>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="type-eyebrow text-muted">Sahoda&rsquo;s version</span>
            <span className="flex flex-wrap gap-1.5">
              <Button
                variant="secondary"
                size="sm"
                aria-label={`Use Sahoda's version for ${target}`}
                onClick={() => {
                  onAccept(suggestion)
                  setSuggestion(null)
                }}
              >
                Use this
              </Button>
              <Button
                variant="ghost"
                size="sm"
                aria-label={`Keep your own ${target}`}
                onClick={() => setSuggestion(null)}
              >
                Keep mine
              </Button>
            </span>
          </div>
          {/* `whitespace-pre-wrap`, because a caption's line breaks are part of
              it. Collapsing them here would show the writer a version that is
              not the one they would get. */}
          <p className="type-sm whitespace-pre-wrap text-ink">{suggestion}</p>
        </div>
      ) : null}

      {failure !== null ? (
        <InlineError>
          {failure.kind === 'insufficient' ? (
            <>
              This needs <span className="tabular-nums">{failure.required}</span>{' '}
              {creditWord(failure.required)} and you have{' '}
              <span className="tabular-nums">{failure.available}</span>. Nothing was charged.{' '}
              <Link href="/wallet" className="font-semibold underline underline-offset-2">
                Top up your wallet
              </Link>
            </>
          ) : (
            // Verbatim: the action owns the charge statement and the retry
            // prompt. Appending our own gives the reader two of each.
            failure.message
          )}
        </InlineError>
      ) : null}
    </div>
  )
}
