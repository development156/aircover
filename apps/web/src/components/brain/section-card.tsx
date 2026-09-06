import type { BrandMemoryPayload } from '@sahoda/shared'

import { Card, CardLabel } from '@/components/ui/card'
import { sectionTally } from '@/lib/brand/brain-ring'
import { fieldsInSection, type BrainSection } from '@/lib/brand/fields'
import { readLeaf } from '@/lib/brand/leaf'
import { stateOf, type Provenance } from '@/lib/brand/provenance'

import { ConfirmAll, type ConfirmAllTarget } from './confirm-all'
import { PopNumber } from './pop-number'
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

  /**
   * Every field in this section that is still a guess, with the value the
   * confirm would record. Built here rather than in the button so the button
   * confirms exactly what this card rendered — a client component fetching its
   * own list could confirm a field the reader never saw.
   */
  const unconfirmed: ConfirmAllTarget[] = fields.flatMap((field) => {
    const value = readLeaf(brain, field.path)
    if (value === undefined) return []
    if (stateOf(provenance, field.path) === 'confirmed') return []
    return [{ path: field.path, value }]
  })

  return (
    <Card data-guide={`brain.section.${section.key}`} className="flex flex-col gap-4">
      <div>
        <div className="flex items-baseline justify-between gap-3">
          <CardLabel className="mb-0">{section.title}</CardLabel>
          <span className="type-eyebrow shrink-0 text-muted">
            <span className="num">
              <PopNumber value={tally.confirmed} />/{tally.total}
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

      <ConfirmAll targets={unconfirmed} />
    </Card>
  )
}
