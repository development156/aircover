import type { BrandMemoryPayload } from '@sahoda/shared'

import { BrandCard, type RegenerateCost } from '@/components/onboarding/brand-card'
import { cn } from '@/lib/utils'

export interface SignalLockCardProps {
  value: BrandMemoryPayload['alignment']
  regenerateCost: RegenerateCost
  onRegenerate: () => void
  regenerateDisabled: boolean
}

const LOCK_COPY: Record<BrandMemoryPayload['alignment']['signal_lock'], string> = {
  strong: 'Strong signal lock',
  moderate: 'Moderate signal lock',
  weak: 'Weak signal — inputs conflict',
}

const LOCK_TONE: Record<BrandMemoryPayload['alignment']['signal_lock'], string> = {
  strong: 'bg-ok-bg text-ok',
  moderate: 'bg-warn-bg text-warn',
  weak: 'bg-danger-bg text-danger',
}

const LOCK_DOT: Record<BrandMemoryPayload['alignment']['signal_lock'], string> = {
  strong: 'bg-ok',
  moderate: 'bg-warn',
  weak: 'bg-danger',
}

/**
 * Signal Lock is computed by the model from every other channel — there's no
 * single field to edit, so this card is read-only aside from Regenerate.
 */
export function SignalLockCard({
  value,
  regenerateCost,
  onRegenerate,
  regenerateDisabled,
}: SignalLockCardProps) {
  return (
    <BrandCard
      title="Signal lock"
      guide="onboarding.card.signal-lock"
      full
      onRegenerate={onRegenerate}
      regenerateDisabled={regenerateDisabled}
      regenerateCost={regenerateCost}
    >
      <span
        className={cn(
          'inline-flex w-fit items-center gap-2 rounded-pill px-3 py-1.5 text-[14px] font-bold',
          LOCK_TONE[value.signal_lock],
        )}
      >
        <span className={cn('size-2.5 rounded-pill', LOCK_DOT[value.signal_lock])} aria-hidden />
        {LOCK_COPY[value.signal_lock]}
      </span>
      <p className="text-[13px] text-muted">{value.note}</p>
    </BrandCard>
  )
}
