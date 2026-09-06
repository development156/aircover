import type { BrandMemoryPayload } from '@sahoda/shared'

import { Card, CardLabel } from '@/components/ui/card'
import { sectionTally } from '@/lib/brand/brain-ring'
import { BRAIN_SECTIONS, DERIVED_FIELDS } from '@/lib/brand/fields'
import type { Provenance } from '@/lib/brand/provenance'
import { Badge, type Rung } from '@/components/ui/badge'

/**
 * THE BADGE SAYS THE VERDICT. THE CARD'S TITLE ALREADY SAYS WHAT OF.
 *
 * These read "Strong signal lock" / "Weak signal, inputs conflict" and sat
 * beside a `CardLabel` reading "Signal lock", so the words "signal lock" landed
 * twice in one header. MEASURED in a browser at 1280px: the long badge did not
 * fit the 340px aside beside the title, and "SIGNAL LOCK" wrapped to two lines
 * with the badge overlapping it.
 *
 * Shortening is not vaguer here, which is the only reason it is allowed: the
 * title supplies "lock", and the CAUSE that "inputs conflict" named is still on
 * screen directly beneath, in `alignment.note` — the model's own account, which
 * `page.test.tsx` pins.
 *
 * `onboarding/cards/signal-lock-card.tsx` keeps its own copy of this map and is
 * deliberately untouched: it is a different surface with a different width, and
 * the two constants were already independent before this change rather than one
 * being split.
 */
const LOCK_COPY: Record<BrandMemoryPayload['alignment']['signal_lock'], string> = {
  strong: 'Very sure',
  moderate: 'Fairly sure',
  weak: 'Not sure yet',
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
      {/* ── THE HEADER IS TITLE AND STATUS, NOT TWO EYEBROWS ─────────────────
          Two `type-eyebrow` labels sat here under `justify-between`, and in the
          340px aside they collided: "Signal lock" and "Derived, not counted"
          wrapped through each other and rendered as the single unreadable line
          "SIGNAL DERIVED, NOT COUNTED LOCK". MEASURED in a browser at 1280px on
          2026-09-03, which is the width this column actually ships at.

          The badge takes the right-hand slot, which is where a status belongs,
          and the caveat moves to the card's foot, which is where a caveat
          belongs. Its exact words are unchanged: `page.test.tsx` pins "Derived,
          not counted" and the claim is the whole point of the card. */}
      <div className="flex items-start justify-between gap-3">
        <CardLabel className="mb-0">{derived.label}</CardLabel>
        <Badge rung={LOCK_RUNG[alignment.signal_lock]} className="shrink-0">
          {LOCK_COPY[alignment.signal_lock]}
        </Badge>
      </div>
      <p className="text-[13px] text-muted">{alignment.note}</p>

      <div className="border-t border-line pt-3">
        <p className="type-eyebrow mb-2 text-muted">Based on</p>
        <ul className="flex flex-col gap-1.5">
          {inputs.map((input) => (
            /* The word "confirmed" was on all five rows and is on the eyebrow
               above them; five repetitions of a label is the noise this pass
               removes. The ratio is what the row is for. */
            <li key={input.title} className="flex items-baseline justify-between gap-3 text-[13px]">
              <span className="text-ink">{input.title}</span>
              <span className="num text-muted">
                {input.tally.confirmed}/{input.tally.total}
              </span>
            </li>
          ))}
        </ul>
        <p className="type-eyebrow mt-3 text-muted">
          Worked out from the fields above. Not counted.
        </p>
      </div>
    </Card>
  )
}
