'use client'

import type { BrandMemoryPayload } from '@sahoda/shared'
import { Info } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { signalClarityPercent } from '@/lib/brand/signal-clarity'

import { AttemptErrorNotice, type AttemptError } from './attempt-error'
import { BrandPersonaCard } from './cards/brand-persona-card'
import { CustomerPersonaCard } from './cards/customer-persona-card'
import { HookCard } from './cards/hook-card'
import { SignalLockCard } from './cards/signal-lock-card'
import { TabooCard } from './cards/taboo-card'
import { VoiceCard } from './cards/voice-card'
import { SignalClarityMeter } from './signal-clarity-meter'

export interface RefineStepProps {
  brain: BrandMemoryPayload
  onChange: (updater: (brain: BrandMemoryPayload) => BrandMemoryPayload) => void
  fallbackMessage: string | null
  balanceAfter: number | null
  regenerateCost: number
  regeneratePending: boolean
  /** The last failed Regenerate, or null. Shown here, not only as a toast. */
  regenerateError: AttemptError | null
  onRegenerate: () => void
  onContinue: () => void
}

/**
 * The Brand Brain as inline-editable cards — never a blank form, it arrives
 * pre-filled by the model (docs/superpowers spec, "3. Refine"). Every card
 * shares one Regenerate affordance because there's a single whole-payload
 * resolve, not a per-channel one.
 */
export function RefineStep({
  brain,
  onChange,
  fallbackMessage,
  balanceAfter,
  regenerateCost,
  regeneratePending,
  regenerateError,
  onRegenerate,
  onContinue,
}: RefineStepProps) {
  const clarity = signalClarityPercent(brain)

  // Spark disables Generate when the balance cannot cover it; Regenerate is the
  // same charge for the same work, so it disables on the same condition. Without
  // this the sixth card still offers a 50-credit action to a wallet holding none,
  // and the only way to learn that is to press it.
  const insufficient = regenerateError?.kind === 'insufficient'
  const regenerateBlocked = regeneratePending || insufficient

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[16px] font-bold text-ink">Refine your Brand Brain</p>
          <p className="mt-1 text-[13px] text-muted">
            Every card is editable. Regenerate re-runs the whole resolve — a new charge, always
            shown first.
          </p>
        </div>
        {balanceAfter !== null ? (
          <p className="font-mono text-[12px] font-semibold text-muted">
            Balance: <span className="tabular-nums text-ink">{balanceAfter}</span> credits
          </p>
        ) : null}
      </div>

      {regenerateError ? <AttemptErrorNotice error={regenerateError} /> : null}

      {fallbackMessage ? (
        <div
          role="status"
          className="flex items-start gap-2 rounded-input border border-tint-300 bg-tint-50 px-3 py-2.5 text-[13px] text-ink dark:bg-s2"
        >
          <Info size={16} className="mt-0.5 shrink-0 text-accent" aria-hidden />
          <p>{fallbackMessage}</p>
        </div>
      ) : null}

      <SignalClarityMeter percent={clarity} />

      <div className="grid gap-4 sm:grid-cols-2">
        <SignalLockCard
          value={brain.alignment}
          regenerateCost={regenerateCost}
          onRegenerate={onRegenerate}
          regenerateDisabled={regenerateBlocked}
        />
        <VoiceCard
          value={brain.voice}
          onChange={(voice) => onChange((current) => ({ ...current, voice }))}
          regenerateCost={regenerateCost}
          onRegenerate={onRegenerate}
          regenerateDisabled={regenerateBlocked}
        />
        <BrandPersonaCard
          value={brain.brand_persona}
          onChange={(brand_persona) => onChange((current) => ({ ...current, brand_persona }))}
          regenerateCost={regenerateCost}
          onRegenerate={onRegenerate}
          regenerateDisabled={regenerateBlocked}
        />
        <CustomerPersonaCard
          value={brain.customer_persona}
          onChange={(customer_persona) => onChange((current) => ({ ...current, customer_persona }))}
          regenerateCost={regenerateCost}
          onRegenerate={onRegenerate}
          regenerateDisabled={regenerateBlocked}
        />
        <HookCard
          value={brain.hook}
          onChange={(hook) => onChange((current) => ({ ...current, hook }))}
          regenerateCost={regenerateCost}
          onRegenerate={onRegenerate}
          regenerateDisabled={regenerateBlocked}
        />
        <TabooCard
          value={brain.taboo}
          onChange={(taboo) => onChange((current) => ({ ...current, taboo }))}
          regenerateCost={regenerateCost}
          onRegenerate={onRegenerate}
          regenerateDisabled={regenerateBlocked}
        />
      </div>

      <div className="flex justify-end border-t border-line pt-4">
        <Button type="button" data-guide="onboarding.continue-theme" onClick={onContinue}>
          Continue to theme
        </Button>
      </div>
    </div>
  )
}
