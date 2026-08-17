import { Card, CardLabel } from '@/components/ui/card'
import { fieldsInSection, type BrainSection } from '@/lib/brand/fields'

/**
 * A Brand Brain section BEFORE the brain exists.
 *
 * ── WHY THIS EXISTS ──────────────────────────────────────────────────────────
 * /brain used to replace every section with one empty state the moment
 * `readBrain()` came back `no-brain`, so a workspace that had not run onboarding
 * saw a single sentence and no structure at all. The reference shows the
 * sections on this tab whether or not they hold anything — Logo, Positioning,
 * Colours, Typography on identity; Voice traits and Tone on voice — because the
 * point of the screen is to say WHAT the Brand Brain holds, and that is exactly
 * the question a new user has.
 *
 * A container is structure; what sits in it is content. Showing the field names
 * with nothing beside them is honest and useful. Showing one sentence instead
 * deletes the answer to "what would I even be filling in?"
 *
 * ── WHY IT IS A SEPARATE COMPONENT AND NOT SectionCard WITH A NULL BRAIN ─────
 * `SectionCard` takes a `BrandMemoryPayload` and a `Provenance` and reads real
 * values and a confirmed tally out of them. Handing it a synthesised empty
 * payload would put a fabricated object on the read path of the one screen whose
 * entire job is telling confirmed facts from guesses, and it would print
 * "0/4 confirmed" — a measurement of a brain that does not exist. This renders
 * the frame and the labels only, and claims nothing.
 */
export function SectionCardEmpty({ section }: { section: BrainSection }) {
  const fields = fieldsInSection(section.key)

  return (
    <Card data-guide={`brain.section.${section.key}`} className="flex flex-col gap-4">
      <div>
        {/* No "n/n confirmed" eyebrow. There is no brain to have confirmed
            anything about, and 0/4 would be a reading of one. */}
        <CardLabel className="mb-0">{section.title}</CardLabel>
        <p className="mt-1 text-[12.5px] text-muted">{section.blurb}</p>
      </div>

      <dl className="grid gap-x-4 gap-y-2.5">
        {fields.map((field) => (
          <div key={field.path} className="flex items-baseline justify-between gap-3">
            <dt className="min-w-0 truncate text-[12.5px] text-muted">{field.label}</dt>
            {/* An em dash, never an empty string and never a zero. This field has
                no value yet, which is different from having a blank one. */}
            <dd className="shrink-0 text-[13px] text-muted">&mdash;</dd>
          </div>
        ))}
      </dl>
    </Card>
  )
}
