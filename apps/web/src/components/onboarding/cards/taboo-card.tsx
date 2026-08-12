import type { BrandMemoryPayload } from '@sahoda/shared'

import { BrandCard, type RegenerateCost } from '@/components/onboarding/brand-card'
import { EditableList } from '@/components/onboarding/editable-list'
import { MAX_OPEN_LIST_ENTRIES } from '@/lib/brand/limits'

export interface TabooCardProps {
  value: BrandMemoryPayload['taboo']
  onChange: (value: BrandMemoryPayload['taboo']) => void
  regenerateCost: RegenerateCost
  onRegenerate: () => void
  regenerateDisabled: boolean
}

export function TabooCard({
  value,
  onChange,
  regenerateCost,
  onRegenerate,
  regenerateDisabled,
}: TabooCardProps) {
  return (
    <BrandCard
      title="Red lines — the Loop will refuse these"
      guide="onboarding.card.taboo"
      full
      onRegenerate={onRegenerate}
      regenerateDisabled={regenerateDisabled}
      regenerateCost={regenerateCost}
    >
      <EditableList
        label="Red lines"
        maxItems={MAX_OPEN_LIST_ENTRIES}
        items={value.red_lines}
        onChange={(red_lines) => onChange({ red_lines })}
      />
    </BrandCard>
  )
}
