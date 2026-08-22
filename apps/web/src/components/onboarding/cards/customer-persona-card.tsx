import type { BrandMemoryPayload } from '@sahoda/shared'

import { BrandCard, type RegenerateCost } from '@/components/onboarding/brand-card'
import { EditableField } from '@/components/onboarding/editable-field'

export interface CustomerPersonaCardProps {
  value: BrandMemoryPayload['customer_persona']
  onChange: (value: BrandMemoryPayload['customer_persona']) => void
  regenerateCost: RegenerateCost
  onRegenerate: () => void
  regenerateDisabled: boolean
}

/**
 * ── THESE THREE ARE SENTENCES, SO THEY GET A BOX THAT HOLDS A SENTENCE ───────
 * MEASURED 2026-08-22 at 1440px on a real generated brain, comparing
 * `scrollWidth` with `clientWidth`:
 *   Pain point        154px over, 75% of the text visible
 *   Fear              145px over, 76% visible
 *   Wants to become    84px over, 84% visible
 * while "Who this is for" — the same kind of content, in the same card, at the
 * same width — wrapped correctly because it was the one marked `multiline`.
 *
 * The model writes these as full sentences and always will; a single-line input
 * makes the founder scrub sideways through their own brand to read it, on the
 * one screen whose whole job is "check this is you before we save it".
 */
export function CustomerPersonaCard({
  value,
  onChange,
  regenerateCost,
  onRegenerate,
  regenerateDisabled,
}: CustomerPersonaCardProps) {
  return (
    <BrandCard
      title="Customer persona"
      guide="onboarding.card.customer-persona"
      onRegenerate={onRegenerate}
      regenerateDisabled={regenerateDisabled}
      regenerateCost={regenerateCost}
    >
      <EditableField
        label="Who this is for"
        multiline
        value={value.one_liner}
        onChange={(one_liner) => onChange({ ...value, one_liner })}
      />
      <EditableField
        label="Pain point"
        multiline
        value={value.primary_pain_point}
        onChange={(primary_pain_point) => onChange({ ...value, primary_pain_point })}
      />
      <EditableField
        label="Fear"
        multiline
        value={value.primary_fear}
        onChange={(primary_fear) => onChange({ ...value, primary_fear })}
      />
      <EditableField
        label="Wants to become"
        multiline
        value={value.desired_identity}
        onChange={(desired_identity) => onChange({ ...value, desired_identity })}
      />
    </BrandCard>
  )
}
