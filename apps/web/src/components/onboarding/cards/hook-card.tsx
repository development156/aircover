import type { BrandMemoryPayload } from '@sahoda/shared'

import { BrandCard, type RegenerateCost } from '@/components/onboarding/brand-card'
import { EditableField } from '@/components/onboarding/editable-field'
import { EditableList } from '@/components/onboarding/editable-list'

export interface HookCardProps {
  value: BrandMemoryPayload['hook']
  onChange: (value: BrandMemoryPayload['hook']) => void
  regenerateCost: RegenerateCost
  onRegenerate: () => void
  regenerateDisabled: boolean
}

export function HookCard({
  value,
  onChange,
  regenerateCost,
  onRegenerate,
  regenerateDisabled,
}: HookCardProps) {
  return (
    <BrandCard
      title="Hook system"
      guide="onboarding.card.hook"
      onRegenerate={onRegenerate}
      regenerateDisabled={regenerateDisabled}
      regenerateCost={regenerateCost}
    >
      <EditableField
        label="Core promise"
        multiline
        value={value.core_promise}
        onChange={(core_promise) => onChange({ ...value, core_promise })}
      />
      <EditableField
        label="Primary emotion"
        value={value.primary_emotion}
        onChange={(primary_emotion) => onChange({ ...value, primary_emotion })}
      />
      <EditableList
        label="Sample hooks"
        fixedLength
        items={value.sample_hooks}
        onChange={(sample_hooks) => onChange({ ...value, sample_hooks })}
      />
    </BrandCard>
  )
}
