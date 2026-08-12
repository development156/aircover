'use client'

import type { BrandMemoryPayload } from '@sahoda/shared'
import { Info } from 'lucide-react'

import type { SaveBrandState } from '@/app/actions/brand-resolve'
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

export interface RevealStepProps {
  brain: BrandMemoryPayload
  onChange: (updater: (brain: BrandMemoryPayload) => BrandMemoryPayload) => void
  /** Set only when this resolve was CHARGED. Null on the free path. */
  balanceAfter: number | null
  /** True when the resolve that produced this brain cost nothing. */
  wasFree: boolean
  fallbackMessage: string | null
  /** Colours found at the door. Empty means the app keeps its defaults. */
  colors: string[]
  regenerateCost: number
  regeneratePending: boolean
  regenerateError: AttemptError | null
  onRegenerate: () => void
  onFinish: () => void
  saving: boolean
  saveState: SaveBrandState | null
}

/**
 * Screen 4 — the reveal.
 *
 * Everything on this screen is editable, because the resolve is a proposal and
 * approving it has to be a real act rather than a formality (UI_RULES: the
 * Certainty System — approving a proposed item is a visible event).
 *
 * The money line is deliberately three-way. A charged resolve shows the balance
 * it left behind; a free one shows that it was free and NO balance, because
 * nothing moved and printing an unchanged number next to an action implies it
 * did; a fallback shows that nothing was charged and that this is a sample.
 */
export function RevealStep({
  brain,
  onChange,
  balanceAfter,
  wasFree,
  fallbackMessage,
  colors,
  regenerateCost,
  regeneratePending,
  regenerateError,
  onRegenerate,
  onFinish,
  saving,
  saveState,
}: RevealStepProps) {
  const clarity = signalClarityPercent(brain)
  const insufficient = regenerateError?.kind === 'insufficient'
  const regenerateBlocked = regeneratePending || insufficient
  const saved = saveState?.ok === true

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[16px] font-bold text-ink">This is what we heard</p>
          <p className="mt-1 text-[13px] text-muted">
            Every card is editable. Nothing is saved until you approve it.
          </p>
        </div>

        {balanceAfter !== null ? (
          <p className="font-mono text-[12px] font-semibold text-muted">
            Balance: <span className="tabular-nums text-ink">{balanceAfter}</span> credits
          </p>
        ) : wasFree ? (
          <p className="font-mono text-[12px] font-semibold text-muted">This one was free</p>
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

      <div className="flex flex-col gap-2 border-t border-line pt-4">
        <p className="text-[12.5px] text-muted">
          {colors.length > 0
            ? 'Approving also paints the app in the colour we found on your site.'
            : 'We found no colour to take, so the app keeps Sahoda’s default. You can set one later.'}
        </p>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            data-guide="onboarding.finish"
            loading={saving}
            disabled={saved}
            onClick={onFinish}
          >
            {saved ? 'Approved' : saving ? 'Saving…' : 'Approve and open Sahoda'}
          </Button>
        </div>

        {saveState && !saveState.ok ? (
          <p role="alert" className="text-[13px] font-semibold text-danger">
            {saveState.message}
          </p>
        ) : null}
      </div>
    </div>
  )
}
