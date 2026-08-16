'use client'

import { useMemo, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import type { Intake } from '@/lib/onboarding/intake'
import { questionFor } from '@/lib/onboarding/question'
import { isUsableRefusal, refusalToRule } from '@/lib/onboarding/refusal'
import { ResolvingPanel } from './resolving-panel'

import { AttemptErrorNotice, type AttemptError } from './attempt-error'

export interface QuestionStepProps {
  intake: Intake
  isPending: boolean
  /** True when this workspace has never saved a brain — the resolve is free. */
  isFree: boolean
  /** Cost of a resolve when it is not free. Server-owned, never hardcoded. */
  cost: number
  attemptError: AttemptError | null
  onResolve: (refusal: string) => void
  onBack: () => void
}

/**
 * Screen 3 — the one question.
 *
 * The counterparty and the moment come from `questions.ts`, keyed on the picks
 * from screen 1. What matters here is what is NOT on this screen: no policy
 * prompt, no "describe your tone", no list of values to tick. One person, one
 * moment, one refusal — see the header comment in `questions.ts` for why asking
 * any other way produces answers worth nothing.
 *
 * The rule is read back live, in their own words, before it is stored.
 */
export function QuestionStep({
  intake,
  isPending,
  isFree,
  cost,
  attemptError,
  onResolve,
  onBack,
}: QuestionStepProps) {
  const question = useMemo(() => questionFor(intake), [intake])
  const [refusal, setRefusal] = useState('')

  // The ask supplies the verb, so the rule reads in the language of the
  // question they just answered.
  const rule = refusalToRule(refusal, question.ask).rule
  const usable = isUsableRefusal(refusal)
  const insufficient = attemptError?.kind === 'insufficient'

  return (
    <div className="flex flex-col gap-6">
      <div>
        <span className="type-eyebrow text-accent">One question</span>
        <p className="mt-2 text-[15px] font-semibold text-ink">{question.counterparty}</p>
        <p className="mt-2 text-[15px] leading-relaxed text-ink">{question.moment}</p>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="refusal">{question.ask}</Label>
        <textarea
          id="refusal"
          value={refusal}
          onChange={(event) => setRefusal(event.target.value)}
          rows={3}
          disabled={isPending}
          placeholder={question.placeholder}
          className="w-full surface-ring rounded-card bg-surface p-3 text-[14px] text-ink transition-micro placeholder:text-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        />
      </div>

      {rule ? (
        <div className="rounded-card border border-line bg-s1 p-4">
          <span className="type-eyebrow text-muted">We will hold this as a rule</span>
          <p aria-live="polite" className="mt-1.5 text-[15px] font-semibold text-ink">
            {rule}
          </p>
          <p className="mt-1 text-[12.5px] text-muted">
            You can edit it on the next screen, and any time after.
          </p>
        </div>
      ) : null}

      {isPending ? <ResolvingPanel isFree={isFree} /> : null}

      <div className="flex flex-col gap-2 border-t border-line pt-4">
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="ghost" onClick={onBack} disabled={isPending}>
            Back
          </Button>
          <Button
            type="button"
            data-guide="onboarding.resolve"
            loading={isPending}
            disabled={!usable || insufficient}
            onClick={() => onResolve(refusal)}
          >
            {isPending ? 'Resolving…' : 'Resolve my brand'}
            {/* UI_RULES credits protocol: the cost lives in the label, never in
                a tooltip — and on the free path there is no number to show. */}
            {!isPending ? (
              <span className="tabular-nums">{isFree ? '· free' : `· ${cost} credits`}</span>
            ) : null}
          </Button>
        </div>

        {!usable ? (
          <p className="text-[12.5px] text-muted">
            Answer in a few words first — this is the one thing we cannot infer.
          </p>
        ) : null}

        {isFree ? (
          <p className="text-[12.5px] text-muted">
            Your first resolve is free. We charge for what Sahoda writes, never for working out who
            you are.
          </p>
        ) : null}

        {attemptError ? <AttemptErrorNotice error={attemptError} /> : null}
      </div>
    </div>
  )
}
