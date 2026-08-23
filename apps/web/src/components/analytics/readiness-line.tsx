import Link from 'next/link'

import { buttonVariants } from '@/components/ui/button'
import type { AnalyticsReadiness } from '@/lib/analytics/readiness'

/**
 * The one statement at the top of /analytics that every section below defers to.
 *
 * ── IT IS LEFT-ALIGNED AND CONTENT-WIDTH, AND BOTH ARE DELIBERATE ────────────
 * The six treatments this replaces were centred paragraphs in full-width cards.
 * MEASURED at 1440: a 1132px card holding a 340px text column — the container
 * three times wider than anything in it, which is docs/27 §3.4's "density set by
 * the container, not the content" and is most of why the page read as apologetic.
 * Centring a sentence in a wide box is what makes it look like a shrug. This one
 * starts at the left margin like every other statement in the product and stops
 * at `--measure-prose`.
 *
 * ── AND IT HAS NO MARKER TILE ────────────────────────────────────────────────
 * `EmptyState`'s 44px orange square was the largest, most saturated object on the
 * emptiest screen in the product, and it carried no information — docs/27 §1's
 * hierarchy inversion, still measurable on 2026-08-23: /analytics EMPTY reads
 * 0.560% brand at 1440 against 0.139% POPULATED, four times louder with nothing
 * to say. The accent that remains is the remedy button, which is the one thing
 * the screen is for (docs/37 §2.3).
 *
 * ── `waiting` GETS NO BUTTON ─────────────────────────────────────────────────
 * Not an oversight. Everything that could report is in place and the readings are
 * on the platform's clock; a control there would invite someone to fix a thing
 * that is not broken, which is the impossible-remedy class in its politest form.
 */
export function ReadinessLine({ readiness }: { readiness: AnalyticsReadiness }) {
  if (readiness.kind === 'measuring') return null

  const remedy = readiness.kind === 'blocked' ? readiness.remedy : null
  const second = readiness.kind === 'blocked' ? readiness.second : null

  return (
    <section
      data-testid="analytics-readiness"
      data-readiness={readiness.kind}
      aria-labelledby="analytics-readiness-head"
      className="surface-ring rounded-card bg-surface p-5"
    >
      <h2 id="analytics-readiness-head" className="type-h3 text-ink">
        {readiness.headline}
      </h2>
      <p className="type-sm mt-1 max-w-[var(--measure-prose)] text-muted">{readiness.detail}</p>

      {remedy ? (
        <div className="mt-4 flex flex-wrap items-center gap-3">
          {/* THE page's one solid brand fill (docs/37 §16). */}
          <Link
            href={remedy.href}
            data-guide="analytics.connect"
            className={buttonVariants({ variant: 'primary' })}
          >
            {remedy.label}
          </Link>
          {second ? (
            <Link href={second.href} className={buttonVariants({ variant: 'secondary' })}>
              {second.label}
            </Link>
          ) : null}
        </div>
      ) : null}
    </section>
  )
}
