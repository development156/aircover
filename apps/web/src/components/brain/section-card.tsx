import type * as React from 'react'

import type { BrandMemoryPayload } from '@sahoda/shared'

import { Card, CardLabel } from '@/components/ui/card'
import { sectionTally } from '@/lib/brand/brain-ring'
import { fieldsInSection, type BrainSection } from '@/lib/brand/fields'
import { readLeaf } from '@/lib/brand/leaf'
import { stateOf, type Provenance } from '@/lib/brand/provenance'

import { cn } from '@/lib/utils'
import { SECTION_ICON, SECTION_ICON_TILE } from './section-icon'
import { ConfirmAll, type ConfirmAllTarget } from './confirm-all'
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
  index = 0,
}: {
  section: BrainSection
  brain: BrandMemoryPayload
  provenance: Provenance
  /** Position in the grid, for the entrance stagger. Optional: a card rendered
   *  on its own simply animates first. */
  index?: number
}) {
  const Icon = SECTION_ICON[section.key]
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
    /* ── THE PRODUCT'S ONE ENTRANCE KEYFRAME, STAGGERED BY INDEX ────────────
       `sl-enter` is 6px of lift and a fade, and docs/37 §12 allows no second
       one: "a screen that fades, a screen that slides and a screen that scales
       read as three products". So the brief's "subtle fade" is that keyframe
       rather than a new one.

       It goes on the CARD, not on a wrapper. A wrapper div would become the grid
       item and the card inside it would stop stretching to the row's height, so
       two cards side by side would end at different depths — a layout change
       smuggled in by an animation.

       `--i` feeds the capped delay in tokens.css, where the ceiling is written
       once. Reduced motion kills the DELAY as well as the duration, which
       matters here: `fill: both` plus a surviving delay leaves a card invisible
       and then snaps it in, giving the person who asked for less motion a
       jumpier screen than everyone else. */
    <Card
      data-guide={`brain.section.${section.key}`}
      className="enter-step flex flex-col gap-4"
      style={{ '--i': index } as React.CSSProperties}
    >
      {/* ── THE HEADER IS A TILE, A STACK, AND A TALLY ────────────────────────
          The glyph is the SAME one the Overview's row for this section uses —
          one map, `section-icon.ts`, so a section cannot look like itself in one
          place and like something else in the other.

          The title and blurb stack beside it rather than the blurb sitting under
          the whole header, which keeps the tally on the title's line where it
          belongs and stops a two-line blurb pushing it down. `items-start`, not
          `items-baseline`: a 36px tile has no baseline to share with text. */}
      <div className="flex items-start gap-3">
        <span aria-hidden className={cn(SECTION_ICON_TILE, 'size-9')}>
          <Icon className="size-[17px]" strokeWidth={2} />
        </span>
        <div className="min-w-0 flex-1">
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
