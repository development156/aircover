import type { BrandMemoryPayload } from '@sahoda/shared'

import { Card, CardLabel } from '@/components/ui/card'
import { sectionTally } from '@/lib/brand/brain-ring'
import { BRAIN_SECTIONS, DERIVED_FIELDS } from '@/lib/brand/fields'
import type { Provenance } from '@/lib/brand/provenance'
import { cn } from '@/lib/utils'

const LOCK_COPY: Record<BrandMemoryPayload['alignment']['signal_lock'], string> = {
  strong: 'Strong signal lock',
  moderate: 'Moderate signal lock',
  weak: 'Weak signal — inputs conflict',
}

const LOCK_TONE: Record<BrandMemoryPayload['alignment']['signal_lock'], string> = {
  strong: 'bg-ok-bg text-ok',
  moderate: 'bg-warn-bg text-warn',
  weak: 'bg-danger-bg text-danger',
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
        <span
          className={cn(
            'inline-flex w-fit items-center gap-2 rounded-pill px-3 py-1.5 text-[14px] font-bold',
            LOCK_TONE[alignment.signal_lock],
          )}
        >
          {LOCK_COPY[alignment.signal_lock]}
        </span>
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
