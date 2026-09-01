import { Sparkle } from 'lucide-react'

import type { MarketingObservation, ObservationDatum } from '@sahoda/shared'

/**
 * WHAT SAHODA NOTICED — the claim, with the arithmetic under it.
 *
 * ── THE NUMBERS ARE THE PRODUCT, NOT THE DECORATION ─────────────────────────
 * An agency asserts and asks you to trust them. docs/53 argued that the whole
 * distinction Sahoda can hold is "specific, instant and evidenced", and evidence
 * that lives in a tooltip is evidence the reader has to go looking for. So the
 * data sits under the sentence, always open, in the same relationship
 * `FieldEvidence` puts a quoted passage in under a brand field.
 *
 * ── NO DATE, NO CHANNEL, NO CTA ─────────────────────────────────────────────
 * Deliberately spare. The observation is one sentence and its receipt; anything
 * else added here would be Sahoda talking about the observation rather than
 * making it. There is also no action button: this notices, it does not
 * recommend, and a "write a post about this" next to a claim about the reader's
 * habits would turn an honest measurement into an upsell.
 */

/**
 * A datum in the reader's terms.
 *
 * The unit lives on the datum rather than in this component's copy because the
 * computer knows what it counted and the screen does not. `per_post` reads as a
 * bare number beside a label that already says "per post" — printing "1 per
 * post per post" is the failure this split exists to avoid.
 */
function readValue(datum: ObservationDatum): string {
  if (datum.unit === 'ratio') return `${Math.round(datum.value * 100)}%`
  if (datum.unit === 'days') return `${datum.value}`
  return `${datum.value}`
}

export function ObservationNote({ observation }: { observation: MarketingObservation }) {
  return (
    <div className="rounded-input bg-surface-2 p-3">
      <p className="type-body flex items-start gap-2 text-ink">
        <Sparkle size={15} strokeWidth={1.8} aria-hidden className="mt-0.5 shrink-0 text-muted" />
        <span className="max-w-[68ch]">{observation.claim}</span>
      </p>

      {/* The receipt. `num` is the tabular-figures class every count in this
          product uses, and it matters more here than anywhere: two rates stacked
          one above the other only read as a comparison if their digits line up. */}
      <dl className="mt-2.5 grid gap-1 border-l-2 border-line pl-2.5">
        {observation.evidence.data.map((datum) => (
          <div key={datum.label} className="flex justify-between gap-4">
            <dt className="type-sm text-muted">{datum.label}</dt>
            <dd className="type-sm num text-ink">{readValue(datum)}</dd>
          </div>
        ))}
      </dl>

      <p className="type-sm mt-2 text-muted">
        Counted from <span className="num">{observation.evidence.postIds.length}</span> of your own
        posts over <span className="num">{observation.evidence.windowDays}</span> days. Sahoda did
        not ask a model for this.
      </p>
    </div>
  )
}
