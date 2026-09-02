import { TrendingUp } from 'lucide-react'
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
 * different bars. Flex children with `rounded-pill` fill the container by
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
 * ── NO BAR IS ORANGE, AND IT TOOK TWO MEASUREMENTS TO GET THERE ─────────────
 * Draft one painted every bar `--brand`. MEASURED: /home populated at 1440 went
 * **0.550% → 0.613%** brand — the accent budget going UP, on a lane whose brief
 * is that the orange should be spent on the one thing the screen is for. Thirty
 * orange bars is thirty things.
 *
 * Draft two kept the accent for the PEAK alone, following Solis and Flux, which
 * each highlight exactly one bar. MEASURED: **still 0.613%.** A 14x168 solid
 * rectangle is a large object, and one of them is most of what thirty were.
 *
 * The reference settles it, and the rule is cleaner than either draft: its
 * balance chart's LINE is green — the accent — and its hours-by-day BARS are
 * neutral. Lines take the accent; bars do not. So every bar here is
 * `--ink-mute`, `TrendArea`'s stroke stays `--brand`, and nothing is lost:
 * the peak is already named in words directly under the chart ("Highest: 30
 * credits on 23 Aug") and in the accessible summary, and height is what encodes
 * it. A highlight would have been a second way of saying the tallest bar is
 * tallest.
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
   * ── THE AXIS IS TWO LABELS, AND THE FIRST ATTEMPT WAS UNREADABLE ──────────
   * Draft one showed every Nth label — roughly eight — each inside its own
   * 1/30th flex column with `truncate`. MEASURED on
   * `page-dash-after__populated__home__full__1440__light`: a column is ~34px at
   * 1440 and "25 Jul" needs ~40, so the axis rendered "25 … 29 … 2 A… 6 …",
   * and at 390 it collapsed to "2. 2. 2. 6. 1. 1. 1. 2.2". Eight labels nobody
   * can read is worse than two they can.
   *
   * The reference gets away with thirty date labels because it draws them at a
   * 1844px viewport. Take its proportion, not its pixels: the two ENDS state
   * the window's extent, which is what an axis is for, and the one date that
   * matters — the peak's — is already named in words directly below the chart
   * and in the accessible summary. Nothing has to truncate, at any width.
   */
  return (
    <figure className={cn('flex flex-col', className)}>
      {/* `gap-1`, not `gap-[3px]`. docs/37 §4's ladder starts at 4 and
          design-lint rule 2 refused the 3 — correctly: a value picked because
          it looked right at one width is exactly how the scale erodes. The
          columns are `flex-1` with the bar capped at 14px and centred, so most
          of the visual separation comes from the column, not the gap. */}
      <div className="flex h-[168px] items-end gap-1 max-narrow:h-[132px]">
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
                    'w-full max-w-[14px] rounded-pill',
                    // Neutral. Lines take the accent, bars do not — see the
                    // header for the two measurements that produced that rule.
                    point.hatched ? 'is-simulated' : 'bg-ink-mute',
                    /* A measured zero is a STUB, and a DIFFERENT FILL. Height
                       alone cannot separate it from a value that rounds to the
                       same 3px floor, and a fill difference survives greyscale
                       the way the rest of the Certainty ladder does.

                       `--line-firm`, NOT `--line`, and that is a collision
                       rather than a preference. `ChartSparse` draws its
                       "nothing measured yet" baseline as `--line` dots, and at
                       3px with gaps between columns a row of `--line` stubs is
                       the SAME PICTURE — so a window of thirty measured zeroes
                       and a window nobody looked at rendered identically, which
                       is the one distinction this chart exists to make. Seen on
                       `page-dash-after__populated__home__full__1440__light`,
                       where the two sit 200px apart on the same screen. */
                    (point.value as number) === 0 && 'bg-line-firm',
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

      {/* THE AXIS SITS UNDER THE CHART IT LABELS. It used to sit BELOW the peak
          caption, which put a sentence about one day between the bars and the
          dates those bars run between. */}
      <div aria-hidden className="mt-2 flex justify-between gap-4 type-meta text-muted">
        <span>{points[0]?.label}</span>
        <span>{points[points.length - 1]?.label}</span>
      </div>

      {/* The one number worth printing. The rest are readable from the shape. */}
      {peakIndex >= 0 ? (
        <p className="mt-3 flex items-center gap-2 rounded-sm bg-surface-2 px-3 py-2 type-meta text-muted">
          <TrendingUp aria-hidden className="size-3.5 shrink-0 text-accent" />
          <span>
            Highest:{' '}
            <span className="num font-semibold text-ink">{peak.toLocaleString('en-IN')}</span>{' '}
            {unit} on {points[peakIndex]!.label}
          </span>
        </p>
      ) : null}

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
