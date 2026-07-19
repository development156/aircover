import type { BrandMemoryPayload } from '@sahoda/shared'

import { BrandCard } from '@/components/onboarding/brand-card'
import { EditableField } from '@/components/onboarding/editable-field'
import { EditableList } from '@/components/onboarding/editable-list'

export interface VoiceCardProps {
  value: BrandMemoryPayload['voice']
  onChange: (value: BrandMemoryPayload['voice']) => void
  regenerateCost: number
  onRegenerate: () => void
  regenerateDisabled: boolean
}

export function VoiceCard({
  value,
  onChange,
  regenerateCost,
  onRegenerate,
  regenerateDisabled,
}: VoiceCardProps) {
  return (
    <BrandCard
      title="Voice"
      guide="onboarding.card.voice"
      onRegenerate={onRegenerate}
      regenerateDisabled={regenerateDisabled}
      regenerateCost={regenerateCost}
    >
      <EditableField
        label="How it sounds"
        multiline
        value={value.descriptor}
        onChange={(descriptor) => onChange({ ...value, descriptor })}
      />
      <EditableField
        label="Register"
        value={value.formality_label}
        onChange={(formality_label) => onChange({ ...value, formality_label })}
      />
      <EditableList
        label="Signature phrases"
        fixedLength
        items={value.signature_phrases}
        onChange={(signature_phrases) => onChange({ ...value, signature_phrases })}
      />
      <EditableList
        label="Never say"
        items={value.banned_phrases}
        onChange={(banned_phrases) => onChange({ ...value, banned_phrases })}
      />
    </BrandCard>
  )
}
