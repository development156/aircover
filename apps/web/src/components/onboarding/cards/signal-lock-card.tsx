import { Badge, type Rung } from '@/components/ui/badge'
import type { BrandMemoryPayload } from '@sahoda/shared'

import { BrandCard, type RegenerateCost } from '@/components/onboarding/brand-card'

export interface SignalLockCardProps {
  value: BrandMemoryPayload['alignment']
  regenerateCost: RegenerateCost
  onRegenerate: () => void
  regenerateDisabled: boolean
}

/**
 * `weak` no longer asserts a CONFLICT.
 *
 * `signal_lock: 'weak'` covers two different situations — inputs that contradict
 * each other, and inputs that were barely there — and the note underneath says
 * which. On the brain the QA walk produced, the label read "inputs conflict"
 * directly above a note reading "were all blank, so this Brand Brain relies on
 * strong inference from category norms". Those inputs were SPARSE, not
 * contradictory, and the badge was contradicting its own explanation.
 *
 * The label now states the strength, which is the only thing this field knows,
 * and leaves the reason to `note`, which is the only thing that knows it.
 */
const LOCK_COPY: Record<BrandMemoryPayload['alignment']['signal_lock'], string> = {
  strong: 'Strong signal lock',
  moderate: 'Moderate signal lock',
  weak: 'Weak signal lock',
}

/**
 * Signal-lock strength as a RUNG, not a colour pair.
 *
 * It had to change: `--warn` and `--danger` are BOTH the brand orange now, and
 * `--warn-bg`/`--danger-bg` are the same 6% wash, so `moderate` and `weak`
 * rendered IDENTICALLY. Three states collapsed to two, and only the label told
 * them apart.
 *
 * The rung is chosen by urgency, which is what this field is actually saying:
 *   weak      inputs CONFLICT — the model is unsure and you should look  -> urgent
 *   moderate  usable, worth improving                                    -> pending
 *   strong    nothing needed                                             -> calm
 * Fill weight, glyph and label, none of them hue.
 */
const LOCK_RUNG: Record<BrandMemoryPayload['alignment']['signal_lock'], Rung> = {
  strong: 'calm',
  moderate: 'pending',
  weak: 'urgent',
}

// The colour-only dot is GONE. `bg-warn` and `bg-danger` are the same colour,
// so it could not distinguish two of its three states — a signal that carried
// no signal. The badge's glyph does the job it was meant to do.

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
      <Badge rung={LOCK_RUNG[value.signal_lock]} className="w-fit">
        {LOCK_COPY[value.signal_lock]}
      </Badge>
      <p className="text-[13px] text-muted">{value.note}</p>
    </BrandCard>
  )
}
