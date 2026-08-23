'use client'

import type { BrandFieldMetaMap, BrandMemoryPayload } from '@sahoda/shared'
import { Info } from 'lucide-react'

import type { SaveBrandState } from '@/app/actions/brand-resolve'
import { Button } from '@/components/ui/button'
import { creditWord } from '@/lib/credit-words'

import { AttemptErrorNotice, type AttemptError } from './attempt-error'
import type { RegenerateCost } from './brand-card'
import { BrandPersonaCard } from './cards/brand-persona-card'
import { CustomerPersonaCard } from './cards/customer-persona-card'
import { HookCard } from './cards/hook-card'
import { SignalLockCard } from './cards/signal-lock-card'
import { TabooCard } from './cards/taboo-card'
import { VoiceCard } from './cards/voice-card'
import { ConfirmedFieldsMeter } from './confirmed-fields-meter'
import { ResolvingPanel } from './resolving-panel'

export interface RevealStepProps {
  brain: BrandMemoryPayload
  /**
   * Per-field provenance for the brain on screen. `undefined` on a fresh resolve
   * — nothing has been saved, so nothing has been confirmed, and the meter says
   * so rather than counting how full the payload is.
   */
  fieldMeta?: BrandFieldMetaMap
  onChange: (updater: (brain: BrandMemoryPayload) => BrandMemoryPayload) => void
  /** Set only when this resolve was CHARGED. Null on the free path. */
  balanceAfter: number | null
  /** True when the resolve that produced this brain cost nothing. */
  wasFree: boolean
  fallbackMessage: string | null
  /** Colours found at the door THIS session. Empty means none were found. */
  colors: string[]
  /** True when the workspace already has an active Brand Skin saved. */
  hasSavedTheme: boolean
  /**
   * False when this reveal is showing a brain loaded from the database rather
   * than one resolved from answers given in this session. See the guard below.
   */
  canRegenerate: boolean
  regenerateCost: RegenerateCost
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
  fieldMeta,
  onChange,
  balanceAfter,
  wasFree,
  fallbackMessage,
  colors,
  hasSavedTheme,
  canRegenerate,
  regenerateCost,
  regeneratePending,
  regenerateError,
  onRegenerate,
  onFinish,
  saving,
  saveState,
}: RevealStepProps) {
  const insufficient = regenerateError?.kind === 'insufficient'

  // `!canRegenerate` is the one that had teeth. Opening /onboarding on a saved
  // brain lands straight here with no picks, no door text and no refusal held
  // in state — so Regenerate posted the DEFAULTS, took the charged path
  // (a saved brain exists, so the resolve is no longer free), debited 50
  // credits, and replaced the loaded brain with a generic one built from the
  // workspace name alone. Six cards offered that button and nothing stopped it.
  const regenerateBlocked = regeneratePending || insufficient || !canRegenerate
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
            Balance: <span className="tabular-nums text-ink">{balanceAfter}</span>{' '}
            {creditWord(balanceAfter)}
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

      <ConfirmedFieldsMeter fieldMeta={fieldMeta} />

      {/* One honest status instead of six dimmed buttons. `ResolvingPanel` is
          already role="status" aria-live="polite" and carries the real elapsed
          clock, so a re-resolve says what it is doing exactly as the first one
          did on the question step. */}
      {regeneratePending ? <ResolvingPanel isFree={regenerateCost === 'free'} /> : null}

      <div className="grid gap-4 narrow:grid-cols-2">
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

      {!canRegenerate ? (
        <p className="text-[12.5px] text-muted">
          Regenerate is off because there is nothing to resolve from. This brain was loaded, not
          answered for. Start over to give Sahoda the three answers again.
        </p>
      ) : null}

      <div className="flex flex-col gap-2 border-t border-line pt-4">
        {/* FOUR states, because "a colour was found" and "a colour is already
            worn" are independent and every combination reads differently.
            Collapsing them costs the truth twice: on re-entry `colors` is empty
            (the door was never opened this session) and "we found no colour"
            is false of a workspace wearing its own theme; and when a themed
            workspace starts over and gives a URL, `saveWorkspaceTheme` ARCHIVES
            what it wears — which "also paints the app" does not say. */}
        <p className="text-[12.5px] text-muted">
          {colors.length > 0
            ? hasSavedTheme
              ? 'Approving replaces the colour this workspace wears with the one we found on your site.'
              : 'Approving also paints the app in the colour we found on your site.'
            : hasSavedTheme
              ? 'The app keeps the colour this workspace already wears.'
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
