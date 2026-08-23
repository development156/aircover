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

/**
 * The title used to read "Red lines — the Loop will refuse these". Nothing
 * refuses anything: red lines are part of the brand context the mesh prepends to
 * every model call, so they SHAPE what Sahoda writes. There is no enforcement
 * gate anywhere in the pipeline, and promising one here would have a user trust a
 * guarantee the product cannot keep — the exact failure the no-fake-success rule
 * exists to prevent. The copy now claims influence, which is what actually
 * happens, and the sub-line says plainly that a human still reads the output.
 */
export function TabooCard({
  value,
  onChange,
  regenerateCost,
  onRegenerate,
  regenerateDisabled,
}: TabooCardProps) {
  return (
    <BrandCard
      title="Red lines, what Sahoda steers away from"
      guide="onboarding.card.taboo"
      full
      onRegenerate={onRegenerate}
      regenerateDisabled={regenerateDisabled}
      regenerateCost={regenerateCost}
    >
      <p className="text-[13px] text-muted">
        These shape every caption Sahoda writes for you. They are guidance to the model, not a
        filter on the way out. Keep reviewing posts before they go live.
      </p>
      <EditableList
        label="Red lines"
        maxItems={MAX_OPEN_LIST_ENTRIES}
        items={value.red_lines}
        onChange={(red_lines) => onChange({ red_lines })}
      />
    </BrandCard>
  )
}
