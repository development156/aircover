import type { BrandMemoryPayload } from '@sahoda/shared'

import { Card, CardLabel } from '@/components/ui/card'
import { sectionTally } from '@/lib/brand/brain-ring'
import { BRAIN_SECTIONS, DERIVED_FIELDS } from '@/lib/brand/fields'
import type { Provenance } from '@/lib/brand/provenance'
import { Badge, type Rung } from '@/components/ui/badge'

const LOCK_COPY: Record<BrandMemoryPayload['alignment']['signal_lock'], string> = {
  strong: 'Strong signal lock',
  moderate: 'Moderate signal lock',
  weak: 'Weak signal — inputs conflict',
}

/**
 * Signal-lock strength as a RUNG, not a colour pair.
 *
 * It had to change: `--warn` and `--danger` are BOTH the brand orange now, and
 * `--warn-bg`/`--danger-bg` are the same 6% wash, so `moderate` and `weak`
 * rendered IDENTICALLY. Three states collapsed to two, and only the label told
 * them apart.
 *
 * The rung is chosen by urgency, which is what this field is actually saying:
 *   weak      inputs CONFLICT — the model is unsure and you should look  -> urgent
 *   moderate  usable, worth improving                                    -> pending
 *   strong    nothing needed                                             -> calm
 * Fill weight, glyph and label, none of them hue.
 */
const LOCK_RUNG: Record<BrandMemoryPayload['alignment']['signal_lock'], Rung> = {
  strong: 'calm',
  moderate: 'pending',
  weak: 'urgent',
}

/**
 * Signal Lock — the one DERIVED field on the brain.
 *
 * It is not editable, so it carries no certainty mark: confirmed and guessed are
 * claims about who wrote a value, and nobody wrote this one. It shows its
 * EVIDENCE instead — the note the model gave for the verdict, and how much of
 * each input section is confirmed rather than guessed. A strong lock computed
 * entirely from guesses is a weaker thing than the same words computed from
 * answers, and this is where a reader can tell the two apart.
 *
 * It sits outside the ring's denominator for the same reason: a conclusion is not
 * a question anyone can answer, so counting it would put the ring out of reach.
 */
export function DerivedCard({
  alignment,
  provenance,
}: {
  alignment: BrandMemoryPayload['alignment']
  provenance: Provenance
}) {
  const derived = DERIVED_FIELDS[0]!
  const inputs = BRAIN_SECTIONS.map((section) => ({
    title: section.title,
    tally: sectionTally(provenance, section.key),
  }))

  return (
    <Card data-guide="brain.section.alignment" className="flex flex-col gap-4">
      <div className="flex items-baseline justify-between gap-3">
        <CardLabel className="mb-0">{derived.label}</CardLabel>
        <span className="type-eyebrow shrink-0 text-muted">Derived — not counted</span>
      </div>

      <div className="flex flex-col gap-2">
        <Badge rung={LOCK_RUNG[alignment.signal_lock]} className="w-fit">
          {LOCK_COPY[alignment.signal_lock]}
        </Badge>
        <p className="text-[13px] text-muted">{alignment.note}</p>
      </div>

      <div className="border-t border-line pt-3">
        <p className="type-eyebrow mb-2 text-muted">Drawn from</p>
        <ul className="flex flex-col gap-1.5">
          {inputs.map((input) => (
            <li key={input.title} className="flex items-baseline justify-between gap-3 text-[13px]">
              <span className="text-ink">{input.title}</span>
              <span className="text-muted">
                <span className="num">
                  {input.tally.confirmed}/{input.tally.total}
                </span>{' '}
                confirmed
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-[12.5px] text-muted">
          Sahoda computed this from the sections above. Confirm more of them and regenerate to draw
          it from your answers instead of its guesses.
        </p>
      </div>
    </Card>
  )
}
