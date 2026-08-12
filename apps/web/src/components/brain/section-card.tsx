import type { BrandMemoryPayload } from '@sahoda/shared'

import { Card, CardLabel } from '@/components/ui/card'
import { sectionTally } from '@/lib/brand/brain-ring'
import { fieldsInSection, type BrainSection } from '@/lib/brand/fields'
import { readLeaf } from '@/lib/brand/leaf'
import { stateOf, type Provenance } from '@/lib/brand/provenance'

import { FieldRow } from './field-row'

/**
 * One section of the brain as a card. The header counts CONFIRMED over total for
 * that section — the same measure as the topbar ring, so a user reading the ring
 * can find which card is holding it back without opening anything.
 */
export function SectionCard({
  section,
  brain,
  provenance,
}: {
  section: BrainSection
  brain: BrandMemoryPayload
  provenance: Provenance
}) {
  const fields = fieldsInSection(section.key)
  const tally = sectionTally(provenance, section.key)

  return (
    <Card data-guide={`brain.section.${section.key}`} className="flex flex-col gap-4">
      <div>
        <div className="flex items-baseline justify-between gap-3">
          <CardLabel className="mb-0">{section.title}</CardLabel>
          <span className="type-eyebrow shrink-0 text-muted">
            <span className="num">
              {tally.confirmed}/{tally.total}
            </span>{' '}
            confirmed
          </span>
        </div>
        <p className="mt-1.5 text-[13px] text-muted">{section.blurb}</p>
      </div>

      <div className="flex flex-col gap-4">
        {fields.map((field) => {
          const value = readLeaf(brain, field.path)
          // A field the registry names but this payload lacks would be a contract
          // drift; the registry test asserts it cannot happen, and skipping beats
          // rendering an editor over `undefined`.
          if (value === undefined) return null
          return (
            <FieldRow
              key={field.path}
              field={field}
              value={value}
              state={stateOf(provenance, field.path)}
            />
          )
        })}
      </div>
    </Card>
  )
}
