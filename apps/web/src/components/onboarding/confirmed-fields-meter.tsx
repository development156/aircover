import type { BrandFieldMetaMap } from '@sahoda/shared'

import { Progress } from '@/components/ui/progress'
import { brainRing } from '@/lib/brand/brain-ring'
import { provenanceOf } from '@/lib/brand/provenance'

export interface ConfirmedFieldsMeterProps {
  /** Per-field provenance, or undefined on a brain nobody has saved yet. */
  fieldMeta: BrandFieldMetaMap | undefined
}

/**
 * The reveal's headline number, and the ONE number all four screens now agree on.
 *
 * ── WHAT THIS REPLACED, AND WHY THE OLD ONE WAS WORSE THAN WRONG ─────────────
 * This slot used to hold a full-width "Fields filled 100%" bar — the largest,
 * brightest element on the payoff screen — sitting directly above a card reading
 * "Weak signal. Customer persona, brand archetype, voice details and hook levers
 * were ALL BLANK, so this Brand Brain relies on strong inference from category
 * norms rather than explicit founder signal."
 *
 * 100% and "all blank", touching, on one card. Both sentences were true: the
 * first counted non-empty leaves on the OUTPUT, the second described the INPUT.
 * No customer can be expected to hold that distinction, and asking them to at
 * the exact moment you are asking them to trust what you built is the worst
 * possible place to try.
 *
 * It was also the only screen that disagreed. Measured on one brain:
 *
 *     /onboarding reveal   FIELDS FILLED 100%
 *     /home                0 of 15 fields confirmed
 *     /brain               Brand confidence 0/15 — 15 still Sahoda's guess
 *     /brain/resolve       15 of 15 fields are still Sahoda's guess
 *
 * Three screens agreed with each other, and the one that disagreed was the first
 * thing a new customer ever sees.
 *
 * So it counts what the other three count. `brainRing` is the existing authority
 * and is called rather than reimplemented — a second implementation of the same
 * number is how they came to disagree in the first place.
 *
 * ── WHY IT READS ZERO HERE, AND WHY THAT IS THE POINT ────────────────────────
 * Nothing is confirmed at the reveal, and that is by construction rather than by
 * accident. `nextFieldMeta` refuses to infer confirmation from the fact that a
 * value changed, precisely because a fresh resolve differs from nothing in all
 * fifteen fields — so treating Finish as agreement would mark the whole brain
 * confirmed on a screen the customer had only scrolled past.
 *
 * A zero is therefore the honest reading, not a degraded one, and it is also the
 * screen's argument: everything here is Sahoda's inference until a person says
 * otherwise, and saying otherwise is free.
 */
export function ConfirmedFieldsMeter({ fieldMeta }: ConfirmedFieldsMeterProps) {
  const ring = brainRing(provenanceOf(fieldMeta))
  const none = ring.confirmed === 0

  return (
    <div
      data-guide="onboarding.confirmed-fields"
      className="surface-ring rounded-card bg-surface p-4"
    >
      <div className="type-eyebrow mb-2 flex items-center justify-between text-muted">
        <span>Confirmed by you</span>
        <span className="tabular-nums text-accent">
          {ring.confirmed} of {ring.total}
        </span>
      </div>
      <Progress
        value={ring.percent}
        label={`${ring.confirmed} of ${ring.total} fields confirmed by you`}
      />
      {/* `type-body` rather than a hand-written 13px: --t-body IS 13px/20px, and
          design-lint ratchets hand-written font sizes at zero new. */}
      <p className="type-body mt-2 text-muted">
        {none ? (
          <>
            Everything below is Sahoda&rsquo;s reading of what it found — none of it came from you
            yet. Confirming a field costs nothing, and a guess Sahoda got wrong stays wrong in
            everything it writes until someone corrects it.
          </>
        ) : (
          <>
            Confirmed means a person checked it. The rest are still Sahoda&rsquo;s reading of what
            it found, and correcting one costs nothing.
          </>
        )}
      </p>
    </div>
  )
}
