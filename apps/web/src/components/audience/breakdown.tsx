import type { AudienceBucket, AudienceDimension } from '@sahoda/publishing'

/**
 * One dimension of the audience Instagram measured, as bars.
 *
 * ── THE BARS ARE SOLID, AND THAT IS THE WHOLE POINT ──────────────────────────
 * Everything on this page is either something a platform measured or something
 * Sahoda worked out, and a shop owner has to be able to tell at a glance without
 * reading a legend. Measured things are drawn with a SOLID FILL; inferred things
 * are drawn with a DASHED EDGE AND NO FILL (`components/audience/inferred.tsx`).
 *
 * That is the app's own Certainty System, not a new vocabulary: `.is-real` versus
 * `.is-proposed`, which docs/26 §3.1 measures as 308 vs 1000 composited greyscale
 * luminance in light and 308 vs 3 in dark. It survives greyscale, colour blindness
 * and a photocopy, which hue never could.
 *
 * ── AND WHY THE SHARE IS SOMETIMES ABSENT ────────────────────────────────────
 * Meta returns only the TOP 45 buckets per dimension, so the buckets DO NOT ADD
 * UP TO THE ACCOUNT. A percentage computed against their sum would be a number no
 * platform ever reported. Shares are computed against the follower total instead,
 * and when that is unknown the bars are drawn against the largest bucket and no
 * percentage is printed at all. A bar with no number is honest; a number with no
 * denominator is not.
 */

const DIMENSION_TITLE: Readonly<Record<AudienceDimension, string>> = {
  age: 'Age',
  gender: 'Gender',
  city: 'Top cities',
  country: 'Top countries',
}

/**
 * Meta's gender codes, spelled out.
 *
 * Translated at RENDER time, never on the way into the database: the stored bucket
 * is whatever Meta said, so a relabelling upstream cannot corrupt collected
 * history. A code this map does not know is printed as it arrived rather than
 * dropped — an unfamiliar label is information, and hiding it would quietly shrink
 * someone's audience.
 */
const GENDER_LABEL: Readonly<Record<string, string>> = {
  F: 'Women',
  M: 'Men',
  U: 'Not specified',
}

function labelFor(dimension: AudienceDimension, bucket: string): string {
  if (dimension !== 'gender') return bucket
  return GENDER_LABEL[bucket] ?? bucket
}

/** How many buckets one card shows. Meta sends up to 45; a phone can read six. */
const SHOWN = 6

export function BreakdownCard({
  dimension,
  buckets,
  followers,
}: {
  dimension: AudienceDimension
  buckets: AudienceBucket[]
  followers: number | null
}) {
  const shown = [...buckets].sort((a, b) => b.value - a.value).slice(0, SHOWN)
  const largest = shown[0]?.value ?? 0
  // Against the account when we know it, against the biggest bucket otherwise —
  // and in the second case nothing is called a percentage.
  const scale = followers !== null && followers > 0 ? followers : largest
  const canShare = followers !== null && followers > 0
  const hidden = buckets.length - shown.length

  return (
    <section
      aria-labelledby={`audience-${dimension}`}
      className="surface-ring flex flex-col gap-3 rounded-card bg-surface p-4"
    >
      <h3 id={`audience-${dimension}`} className="type-h3 text-ink">
        {DIMENSION_TITLE[dimension]}
      </h3>

      <ul className="flex flex-col gap-2.5">
        {shown.map((bucket) => {
          const width = scale > 0 ? Math.min(100, (bucket.value / scale) * 100) : 0
          return (
            <li key={bucket.label} className="flex flex-col gap-1">
              <div className="type-sm flex items-baseline justify-between gap-3">
                <span className="min-w-0 truncate text-ink">
                  {labelFor(dimension, bucket.label)}
                </span>
                <span className="num shrink-0 text-muted">
                  {bucket.value.toLocaleString()}
                  {canShare ? ` · ${Math.round((bucket.value / followers) * 100)}%` : ''}
                </span>
              </div>
              {/* SOLID FILL — measured. The track carries a ring so it is a
                  structure rather than a shade: in dark, --surface-2 equals
                  --surface, so a tint track would vanish. */}
              <div className="surface-ring-firm h-1.5 w-full overflow-hidden rounded-pill bg-surface-3">
                <div
                  data-layer="measured"
                  className="h-full rounded-pill bg-brand"
                  style={{ width: `${width}%`, minWidth: bucket.value > 0 ? '3px' : undefined }}
                />
              </div>
            </li>
          )
        })}
      </ul>

      {hidden > 0 ? (
        <p className="type-sm text-muted">
          <span className="num">{hidden}</span> more not shown.
        </p>
      ) : null}
    </section>
  )
}
