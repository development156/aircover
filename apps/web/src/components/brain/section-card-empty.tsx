import { Unmeasured } from '@/components/design-system/absence-row'
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
        <p className="mt-1 type-sm text-muted">{section.blurb}</p>
      </div>

      <dl className="grid gap-x-4 gap-y-2.5">
        {fields.map((field) => (
          <div key={field.path} className="flex items-baseline justify-between gap-3">
            <dt className="min-w-0 truncate type-sm text-muted">{field.label}</dt>
            {/* THE MARK, NOT AN EM DASH.
                The claim this row makes has always been right — the field is
                real and has no value yet, which is different from having a
                blank one — and until now it was made with a bare `&mdash;`.
                docs/26 §11 forbids that by name ("Do not render an em dash for
                a missing value"), and §4 gives it a vocabulary: a solid rule
                for "not yet measured", carrying an accessible name.
                The name is the point. A dash has none, so a screen reader
                skipped straight from the field label to the next label and the
                absence was invisible rather than legible — on the six Brand
                Brain tabs that render this card — /brain/identity and
                /brain/voice — in the no-brain state, which is what a new
                account sees. (/brain's hub carried the same dash in its own
                section list and is fixed alongside; /brain/audience,
                /competitors and /knowledge are ComingSoon pages and never
                reach this component.) This file predates the absence vocabulary and
                nothing brought it forward; docs/27 §3.1 counted five of these
                on /brain and no lane owned them. */}
            <dd className="shrink-0">
              <Unmeasured what={field.label} />
            </dd>
          </div>
        ))}
      </dl>
    </Card>
  )
}
