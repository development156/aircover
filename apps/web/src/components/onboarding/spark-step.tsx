'use client'

import { useEffect, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'

import { AttemptErrorNotice, type AttemptError } from './attempt-error'
import { LogoDrop, type LogoValue } from './logo-drop'

export interface SparkValues {
  name: string
  category: string
  /**
   * The only intake field measured to move `signal_lock` off `weak`
   * (2026-08-12: name+category → weak, +website+instagram → weak,
   * +description → moderate). Optional, because blanks never block.
   */
  description: string
  website: string
  instagram: string
}

export interface SparkStepProps {
  formAction: (payload: FormData) => void
  /** Fired synchronously on submit (before the action runs) — clears the old error banner. */
  onSubmitStart: () => void
  isPending: boolean
  attemptError: AttemptError | null
  spark: SparkValues
  onSparkChange: (patch: Partial<SparkValues>) => void
  logo: LogoValue | null
  onLogoChange: (logo: LogoValue | null) => void
  /**
   * Held by the parent, exactly like `logo`, and NOT part of SparkValues — a
   * File is not a string. It has to live above this component because Regenerate
   * rebuilds its FormData by hand: leave the file here and the second resolve
   * silently reads a worse intake than the first.
   */
  brandBook: File | null
  onBrandBookChange: (file: File | null) => void
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
  brandBook,
  onBrandBookChange,
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
            Category <span className="font-normal text-muted">(optional)</span>
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
        {/*
          One sentence, optional. This is the highest-yield field on the screen:
          it is the only one measured to move signal_lock off `weak`. The
          placeholder shows what good looks like — specific, local, and in the
          founder's own words — because "describe your business" reliably
          returns the category back.
        */}
        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <Label htmlFor="spark-description">
            What do you do, in one sentence?{' '}
            <span className="font-normal text-muted">(optional)</span>
          </Label>
          <Textarea
            id="spark-description"
            name="description"
            disabled={isPending}
            value={spark.description}
            onChange={(event) => onSparkChange({ description: event.target.value })}
            placeholder="e.g. A two-room bookshop off a Buxi Bazaar side street where Odia poetry sits at eye level and the reading room upstairs is never rushed."
            className="min-h-[64px]"
          />
          <p className="text-[12px] text-muted">
            The more specific, the sharper the Brand Brain. Name the street, the regulars, the thing
            you refuse to do.
          </p>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="spark-website">
            Website <span className="font-normal text-muted">(optional)</span>
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
            Instagram handle <span className="font-normal text-muted">(optional)</span>
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

        {/*
          The UPLOAD door (doc 18 §5): "brands with a brand book; agencies
          inheriting one". Parsed by OpenRouter's free cloudflare-ai engine — the
          engine is named explicitly because the provider default falls back to
          paid OCR. Everything it yields is confirmed:false, like the crawl.
        */}
        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <Label htmlFor="spark-brandbook">
            Brand book or prospectus <span className="font-normal text-muted">(optional, PDF)</span>
          </Label>
          <Input
            id="spark-brandbook"
            name="brandbook"
            type="file"
            accept="application/pdf"
            disabled={isPending}
            onChange={(event) => onBrandBookChange(event.target.files?.[0] ?? null)}
            className="file:mr-3 file:rounded-control file:border-0 file:bg-tint-100 file:px-3 file:py-1.5 file:text-[13px] file:font-semibold file:text-ink dark:file:bg-s2"
          />
          <p className="text-[12px] text-muted">
            {brandBook
              ? `Reading ${brandBook.name}.`
              : 'If you have one, this is the richest thing you can give us — it states red lines a website only implies.'}
          </p>
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

        {attemptError ? <AttemptErrorNotice error={attemptError} /> : null}
      </div>
    </form>
  )
}
