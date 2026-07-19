import type { BrandMemoryPayload } from '@sahoda/shared'

import { BrandCard } from '@/components/onboarding/brand-card'
import { EditableField } from '@/components/onboarding/editable-field'

export interface CustomerPersonaCardProps {
  value: BrandMemoryPayload['customer_persona']
  onChange: (value: BrandMemoryPayload['customer_persona']) => void
  regenerateCost: number
  onRegenerate: () => void
  regenerateDisabled: boolean
}

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
        value={value.primary_pain_point}
        onChange={(primary_pain_point) => onChange({ ...value, primary_pain_point })}
      />
      <EditableField
        label="Fear"
        value={value.primary_fear}
        onChange={(primary_fear) => onChange({ ...value, primary_fear })}
      />
      <EditableField
        label="Wants to become"
        value={value.desired_identity}
        onChange={(desired_identity) => onChange({ ...value, desired_identity })}
      />
    </BrandCard>
  )
}
