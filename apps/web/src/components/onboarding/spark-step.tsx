'use client'

import { useEffect, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

import { LogoDrop, type LogoValue } from './logo-drop'

export interface SparkValues {
  name: string
  category: string
  website: string
  instagram: string
}

export type SparkAttemptError =
  | { kind: 'insufficient'; message: string; required: number; available: number }
  | { kind: 'error'; message: string }

export interface SparkStepProps {
  formAction: (payload: FormData) => void
  /** Fired synchronously on submit (before the action runs) — clears the old error banner. */
  onSubmitStart: () => void
  isPending: boolean
  attemptError: SparkAttemptError | null
  spark: SparkValues
  onSparkChange: (patch: Partial<SparkValues>) => void
  logo: LogoValue | null
  onLogoChange: (logo: LogoValue | null) => void
  generateCost: number
}

// Honest generation status lines (docs/superpowers spec, "2. Generating") —
// cycled while pending via aria-live, never a bare spinner.
const STATUS_LINES = [
  'Mapping your customer…',
  'Resolving voice…',
  'Cross-checking red lines…',
  'Writing sample hooks…',
]
const STATUS_INTERVAL_MS = 1100

function useCyclingStatus(active: boolean): string {
  const [index, setIndex] = useState(0)
  useEffect(() => {
    if (!active) {
      setIndex(0)
      return
    }
    const id = setInterval(
      () => setIndex((current) => (current + 1) % STATUS_LINES.length),
      STATUS_INTERVAL_MS,
    )
    return () => clearInterval(id)
  }, [active])
  return STATUS_LINES[index]!
}

/**
 * Step 1 (Spark) + step 2 (Generate) live on one screen: the fields never
 * unmount mid-attempt, so a Retry resubmits the SAME <form> with the same values.
 * The ledger key is derived SERVER-side (never sent from here) — a client-supplied
 * one could replay a spent key and re-run the paid resolve for free.
 */
export function SparkStep({
  formAction,
  onSubmitStart,
  isPending,
  attemptError,
  spark,
  onSparkChange,
  logo,
  onLogoChange,
  generateCost,
}: SparkStepProps) {
  const status = useCyclingStatus(isPending)
  const insufficient = attemptError?.kind === 'insufficient'
  const buttonLabel = isPending
    ? 'Generating…'
    : attemptError?.kind === 'error'
      ? 'Try again'
      : 'Generate brand brain'

  return (
    <form action={formAction} onSubmit={onSubmitStart} className="flex flex-col gap-5">
      <div data-guide="onboarding.start">
        <p className="text-[16px] font-bold text-ink">Give Sahoda a spark</p>
        <p className="mt-1 text-[13px] text-muted">
          Just the essentials — the Brand Brain infers the rest. Blank fields are fine, they never
          block.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <Label htmlFor="spark-name">Business name</Label>
          <Input
            id="spark-name"
            name="name"
            required
            disabled={isPending}
            value={spark.name}
            onChange={(event) => onSparkChange({ name: event.target.value })}
            placeholder="e.g. Chai & Chapters"
          />
        </div>
        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <Label htmlFor="spark-category">
            Category <span className="font-normal text-faint">(optional)</span>
          </Label>
          <Input
            id="spark-category"
            name="category"
            disabled={isPending}
            value={spark.category}
            onChange={(event) => onSparkChange({ category: event.target.value })}
            placeholder="e.g. Retail — books & specialty café"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="spark-website">
            Website <span className="font-normal text-faint">(optional)</span>
          </Label>
          <Input
            id="spark-website"
            name="website"
            type="url"
            disabled={isPending}
            value={spark.website}
            onChange={(event) => onSparkChange({ website: event.target.value })}
            placeholder="https://…"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="spark-instagram">
            Instagram handle <span className="font-normal text-faint">(optional)</span>
          </Label>
          <Input
            id="spark-instagram"
            name="instagram"
            disabled={isPending}
            value={spark.instagram}
            onChange={(event) => onSparkChange({ instagram: event.target.value })}
            placeholder="@yourbrand"
          />
        </div>
        <div className="sm:col-span-2">
          <LogoDrop value={logo} onChange={onLogoChange} guide="onboarding.logo-upload" />
        </div>
      </div>

      <div className="flex flex-col gap-2 border-t border-line pt-4">
        <Button
          type="submit"
          data-guide="onboarding.generate"
          loading={isPending}
          disabled={insufficient}
          className="self-start"
        >
          {buttonLabel}
          {!isPending ? <span className="tabular-nums">· Uses {generateCost} credits</span> : null}
        </Button>

        <p
          aria-live="polite"
          className="min-h-[16px] font-mono text-[12px] font-semibold text-accent"
        >
          {isPending ? status : null}
        </p>

        {attemptError ? (
          <div
            role="alert"
            className="rounded-input border border-danger-bg bg-danger-bg px-3 py-2.5 text-[13px] text-danger"
          >
            {attemptError.kind === 'insufficient' ? (
              <p>
                Not enough credits to resolve your Brand Brain — this needs{' '}
                <span className="tabular-nums">{attemptError.required}</span>, you have{' '}
                <span className="tabular-nums">{attemptError.available}</span>.
              </p>
            ) : (
              <p>{attemptError.message}</p>
            )}
          </div>
        ) : null}
      </div>
    </form>
  )
}
