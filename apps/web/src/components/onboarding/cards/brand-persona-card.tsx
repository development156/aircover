import type { BrandMemoryPayload } from '@sahoda/shared'

import { BrandCard } from '@/components/onboarding/brand-card'
import { EditableField } from '@/components/onboarding/editable-field'
import { EditableList } from '@/components/onboarding/editable-list'

export interface BrandPersonaCardProps {
  value: BrandMemoryPayload['brand_persona']
  onChange: (value: BrandMemoryPayload['brand_persona']) => void
  regenerateCost: number
  onRegenerate: () => void
  regenerateDisabled: boolean
}

export function BrandPersonaCard({
  value,
  onChange,
  regenerateCost,
  onRegenerate,
  regenerateDisabled,
}: BrandPersonaCardProps) {
  return (
    <BrandCard
      title="Brand persona"
      guide="onboarding.card.brand-persona"
      onRegenerate={onRegenerate}
      regenerateDisabled={regenerateDisabled}
      regenerateCost={regenerateCost}
    >
      <EditableField
        label="Archetype"
        value={value.archetype}
        onChange={(archetype) => onChange({ ...value, archetype })}
      />
      <EditableField
        label="As a person"
        multiline
        value={value.one_liner}
        onChange={(one_liner) => onChange({ ...value, one_liner })}
      />
      <EditableList
        label="Core values"
        fixedLength
        items={value.core_values}
        onChange={(core_values) => onChange({ ...value, core_values })}
      />
    </BrandCard>
  )
}
