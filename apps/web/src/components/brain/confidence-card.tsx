import { Check, Sparkles } from 'lucide-react'

import { brainRing } from '@/lib/brand/brain-ring'
import type { Provenance } from '@/lib/brand/provenance'

/**
 * The Overview's lead card — the reference's "Brand completeness", replaced.
 *
 * ── WHY THIS IS NOT A COMPLETENESS BAR ───────────────────────────────────────
 * The reference leads with "Brand completeness 94%", meaning how much is FILLED.
 * This product's measure is how much a HUMAN CONFIRMED, and the two are
 * different claims: a brain can be 100% filled and 0% confirmed, because a
 * resolve fills every field with the model's best guess. A completeness bar
 * would read 100% on a brain nobody has checked — the single most misleading
 * number this page could show.
 *
 * So the bar is SPLIT rather than filled. Confirmed is solid; inferred is
 * hatched, which is the Certainty System's own signature for "not a settled
 * fact". Both segments are labelled, and the split survives greyscale because it
 * is carried by fill weight and by texture, never by hue.
 */
export function ConfidenceCard({ provenance }: { provenance: Provenance }) {
  const ring = brainRing(provenance)
  const inferred = Math.max(0, ring.total - ring.confirmed)
  const pct = ring.total === 0 ? 0 : Math.round((ring.confirmed / ring.total) * 100)

  return (
    <section
      className="surface-ring-lift rounded-card bg-surface"
      aria-labelledby="brain-confidence"
    >
      <header className="flex min-h-[46px] items-center gap-3 border-b border-line-soft px-4 py-3">
        <h2 id="brain-confidence" className="text-[14px] font-semibold tracking-[-0.01em]">
          Brand confidence
        </h2>
        <span className="ml-auto text-[13px] font-[650] tabular-nums">
          {ring.confirmed}/{ring.total}
        </span>
      </header>

      <div className="px-4 py-4">
        {/* The split bar. Two segments, each with its own texture, so the ratio
            is readable before any label is. */}
        <div
          className="surface-ring flex h-[10px] w-full overflow-hidden rounded-pill bg-surface"
          role="img"
          aria-label={`${ring.confirmed} of ${ring.total} fields confirmed by a person; ${inferred} still inferred by Sahoda.`}
        >
          <div className="h-full bg-ink" style={{ width: `${pct}%` }} />
          {/* The remainder is HATCHED — `.is-simulated`'s texture, meaning "not
              a settled fact" — rather than left blank. Blank would read as
              "nothing there"; these fields do have values, they are just
              nobody's answer yet. */}
          <div
            className="h-full flex-1"
            style={{
              backgroundImage:
                'repeating-linear-gradient(-45deg, transparent 0 5px, var(--hatch) 5px 6px)',
            }}
          />
        </div>

        <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1">
          <li className="flex items-center gap-[6px] text-[12px] text-muted">
            <Check className="size-[13px] shrink-0 text-ink" aria-hidden />
            <span className="font-[550] text-ink tabular-nums">{ring.confirmed}</span> confirmed
          </li>
          <li className="flex items-center gap-[6px] text-[12px] text-muted">
            <Sparkles className="size-[13px] shrink-0" aria-hidden />
            <span className="font-[550] tabular-nums">{inferred}</span> still Sahoda&rsquo;s guess
          </li>
        </ul>

        {/* ── ONE LINE, AND IT IS NOT OPTIONAL ─────────────────────────────
            This was three sentences and the compaction pass deleted it. That
            was wrong twice over and `brain-claim.test.ts` caught it: the screen
            must NAME at least one thing the brain genuinely reaches, or the
            most important page in the product describes only its own parts —
            the "screaming tech" failure CLAUDE.md's Tone Setup ruling is about.

            What survives is the capability. What went is the second half, which
            explained that a wrong guess stays wrong until corrected and that
            correcting is free — both true, and both already said on the panel
            to the right of this one.

            The three named things are the three that are TRUE. The same guard
            refuses "reply" and "campaign" here, because no mesh task writes a
            reply and a campaign has no generation step of its own. */}
        <p className="mt-3 text-[12px] text-muted">
          Sahoda writes your captions, your weekly plan and your website from these fields.
        </p>
      </div>
    </section>
  )
}
