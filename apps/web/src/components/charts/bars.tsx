import { cn } from '@/lib/utils'

/**
 * VERTICAL BARS, ROUNDED CAPS, NO GRIDLINES. The reference's own chart.
 *
 * ── WHY THESE ARE DIVS AND NOT AN SVG ────────────────────────────────────────
 * The app's other two charts are hand-rolled SVG with
 * `preserveAspectRatio="none"`, which is right for a LINE — it stretches to fill
 * whatever width it is given and `vector-effect` keeps the stroke honest. It is
 * wrong for a bar with a rounded cap: non-uniform scaling turns every circle
 * into an ellipse, so a 62px-wide panel and a 900px-wide one draw visibly
 * different bars. Flex children with `rounded-full` fill the container by
 * construction, and the cap is a cap at every width.
 *
 * ── THE THREE THINGS A DAY CAN BE, AND THEY ARE NOT THE SAME THING ───────────
 * This is the whole reason the component exists rather than a `<div>` per row
 * at the call site:
 *
 *   · MEASURED, non-zero  → a bar, height proportional to the peak.
 *   · MEASURED ZERO       → a stub at the baseline. Real knowledge: somebody
 *                           looked and the answer was none. Runey draws nothing
 *                           at all here and that is the one thing in its chart
 *                           this product may not copy, because it makes a
 *                           measured zero and an unasked day identical.
 *   · NOT MEASURED        → nothing, and the axis label goes faint. There is no
 *                           bar to draw because there is no reading, and a zero
 *                           would be a claim nobody made.
 *
 * ── AND A FOURTH, WHICH IS WHY `hatched` EXISTS ──────────────────────────────
 * A projected or simulated value takes `.is-simulated` — the hatch from the
 * Certainty System, unchanged. Flux does exactly this: its unhighlighted months
 * are hatched and the highlighted one is solid, which is a ladder of INK
 * COVERAGE and survives greyscale. It is the same ladder docs/37 §9 already
 * ships, so this reuses the class rather than inventing a second hatch.
 *
 * The hatch is never rendered without the label the caller must pass with it —
 * `.is-simulated`'s own contract, restated in `assert` form below.
 *
 * ── ONE LABEL, NOT TWENTY ────────────────────────────────────────────────────
 * The peak gets a value pill (Nixtio puts the figure in a small pill at the end
 * of each bar; at thirty bars that is thirty numbers, so it goes on the one
 * that is worth reading). Everything else is legible from the axis and the
 * card's own total.
 *
 * ── ENTRANCE ─────────────────────────────────────────────────────────────────
 * `enter-step`, the product's ONE entrance (docs/37 §12), staggered along the
 * axis. No new keyframe: a bar chart that grows from the baseline needs
 * `scaleY`, which squashes the rounded cap for the length of the animation, and
 * a second motion vocabulary is a worse trade than a bar that fades up 6px.
 * Reduced motion is already handled in tokens.css for this class.
 */

export interface BarPoint {
  /** Axis label. Short — "Mon", "12 Aug". */
  label: string
  /** The reading. `null` is NOT MEASURED and is not a zero. */
  value: number | null
  /** Draw this bar hatched. Requires `hatchLabel` on the chart. */
  hatched?: boolean
}

export function Bars({
  points,
  /** What one bar is a quantity OF. Goes into the accessible summary. */
  unit,
  /** Required when any point is hatched: the hatch alone is never a claim. */
  hatchLabel,
  className,
}: {
  points: readonly BarPoint[]
  unit: string
  hatchLabel?: string
  className?: string
}) {
  const measured = points.filter((p) => p.value !== null)
  const peak = Math.max(0, ...measured.map((p) => p.value ?? 0))
  const peakIndex = points.findIndex((p) => p.value !== null && p.value === peak && peak > 0)

  // The hatch is a CLAIM about the numbers and it may not be made silently.
  const hatchedCount = points.filter((p) => p.hatched).length
  if (hatchedCount > 0 && !hatchLabel) {
    throw new Error('Bars: a hatched bar needs `hatchLabel` — the hatch alone is not a claim')
  }

  /**
   * Every axis label at 30 points is a wall of 12px type. Show roughly eight,
   * always including the first and last so the window's own extent is readable.
   */
  const every = Math.max(1, Math.ceil(points.length / 8))
  const shows = (i: number) => i === 0 || i === points.length - 1 || i % every === 0

  return (
    <figure className={cn('flex flex-col', className)}>
      <div className="flex h-[168px] items-end gap-[3px] max-narrow:h-[132px]">
        {points.map((point, i) => {
          const measuredHere = point.value !== null
          // `peak || 1` only avoids a divide by zero on an all-zero window; it
          // never invents height, because every numerator there is 0.
          const pct = measuredHere ? ((point.value as number) / (peak || 1)) * 100 : 0
          return (
            <div
              key={`${point.label}-${i}`}
              className="enter-step flex min-w-0 flex-1 items-end justify-center self-stretch"
              style={{ '--i': Math.min(i, 8) } as React.CSSProperties}
            >
              {measuredHere ? (
                <span
                  data-bar={(point.value as number) === 0 ? 'zero' : 'value'}
                  className={cn(
                    'w-full max-w-[14px] rounded-full',
                    point.hatched ? 'is-simulated' : 'bg-brand',
                    /* A measured zero is a STUB, and a DIFFERENT FILL. Height
                       alone cannot separate it from a value that rounds to the
                       same 3px floor, and `--line` against `--brand` is a fill
                       difference rather than a hue one, so it survives
                       greyscale like the rest of the Certainty ladder. */
                    (point.value as number) === 0 && 'bg-line',
                  )}
                  /* `minHeight` rather than `height: max(3px, N%)`, and the
                     reason is worth recording: jsdom's CSS parser DROPS the
                     `max()` function, so the style attribute came back empty
                     and `trend-area.test.tsx` counted one bar where three
                     rendered. The assertion was right and could not see the
                     thing it was asserting on — a test that cannot observe the
                     product is the failure mode this repo has already recorded
                     twice. Two plain declarations do the same job everywhere. */
                  style={{
                    height: `${pct.toFixed(2)}%`,
                    minHeight: '3px',
                  }}
                />
              ) : null}
            </div>
          )
        })}
      </div>

      {/* The one number worth printing. The rest are readable from the shape. */}
      {peakIndex >= 0 ? (
        <p className="mt-3 type-meta text-muted">
          Highest:{' '}
          <span className="num font-semibold text-ink">{peak.toLocaleString('en-IN')}</span> {unit}{' '}
          on {points[peakIndex]!.label}
        </p>
      ) : null}

      <div aria-hidden className="mt-2 flex gap-[3px] border-t border-line-soft pt-2">
        {points.map((point, i) => (
          <span
            key={`ax-${point.label}-${i}`}
            className={cn(
              'min-w-0 flex-1 truncate text-center type-meta',
              // Faint where nothing was measured — the axis carries the second
              // half of "there is no bar here because nobody looked".
              point.value === null ? 'text-muted opacity-60' : 'text-muted',
              !shows(i) && 'invisible',
            )}
          >
            {point.label}
          </span>
        ))}
      </div>

      {hatchLabel ? (
        <p className="mt-2 flex items-center gap-2 type-meta text-muted">
          <span aria-hidden className="is-simulated inline-block h-3 w-4 rounded-xs" />
          {hatchLabel}
        </p>
      ) : null}

      {/* The chart in words. `figcaption` rather than an `aria-label` on a div:
          this is the summary a screen reader gets INSTEAD of 30 bars, and the
          count of unmeasured days is part of it — an absence is information. */}
      <figcaption className="sr-only">
        {measured.length} of {points.length} {points.length === 1 ? 'point' : 'points'} measured
        {peak > 0 ? `, highest ${peak} ${unit} on ${points[peakIndex]!.label}` : ''}.
        {points.length - measured.length > 0
          ? ` ${points.length - measured.length} not measured.`
          : ''}
      </figcaption>
    </figure>
  )
}
