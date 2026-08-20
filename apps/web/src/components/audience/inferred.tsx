import type { FollowerDay } from '@/lib/audience/page-data'

/**
 * THE LINE, AND EVERYTHING BELOW IT.
 *
 * ── THE LINE IS THE FEATURE ──────────────────────────────────────────────────
 * Above it, every number came from Instagram. Below it, every number is Sahoda's
 * arithmetic on those numbers. A shop owner acting on the second kind is taking a
 * different sort of risk from one acting on the first, and the only way to make
 * that safe to ship is to make the difference impossible to miss.
 *
 * The separation is carried three ways, none of them hue:
 *   · a labelled rule that says it in words;
 *   · `.is-proposed` on every panel below — DASHED EDGE, NO FILL, which docs/26
 *     §3.1 measures at 1000/1000 composited greyscale luminance in light and
 *     3/1000 in dark, against the solid `.is-real` fill at 308 in both;
 *   · the word "Worked out" on each panel's own eyebrow.
 *
 * ── WHY DASHED AND NOT HATCHED ───────────────────────────────────────────────
 * The obvious reading of "solid versus hatched" is `.is-simulated`, and that rung
 * is already spoken for: it means NOT REAL — a fixture that never touched a
 * platform. An inference drawn from real measurements is a weak claim, not a false
 * one, and stamping it with the mark reserved for fixtures would destroy the one
 * signal that currently tells a customer a number never left the building.
 * `.is-proposed` is this app's existing word for "Sahoda suggests it; nobody has
 * agreed", which is exactly what these panels are.
 *
 * ── AND EVERY PANEL HERE STATES ITS OWN EVIDENCE ─────────────────────────────
 * A projection with no sample size is unfalsifiable, which is the one thing this
 * product may never publish about a customer's own business. Each panel says how
 * many days it is standing on, and REFUSES to produce a figure when that is not
 * enough — see `growthPace`, which returns null far more often than it returns a
 * number.
 */

export function InferredLine() {
  return (
    <div className="flex items-center gap-3" role="separator" aria-label="Below this line, Sahoda is working things out rather than reporting them">
      <span aria-hidden className="h-px flex-1 bg-line" />
      <span className="type-eyebrow shrink-0 text-muted">Below here, Sahoda is working it out</span>
      <span aria-hidden className="h-px flex-1 bg-line" />
    </div>
  )
}

/** A panel of the inferred layer. Dashed, unfilled, and labelled. */
export function InferredPanel({
  title,
  evidence,
  children,
}: {
  title: string
  /** What this stands on, in the customer's terms. Never omitted. */
  evidence: string
  children: React.ReactNode
}) {
  return (
    <section
      // The layer, named. `.is-proposed` also appears on the certainty ladder and
      // on three roadmap screens, so a probe that selected by class alone would
      // measure a chip somewhere else on the page and report a number about it —
      // which is exactly what the first version of `audience-layers.spec.ts` did.
      data-layer="worked-out"
      className="is-proposed flex flex-col gap-2 rounded-card p-4"
    >
      <p className="type-eyebrow text-muted">Worked out</p>
      {/* `text-ink`, not the inherited `--ink-mute` that `.is-proposed` sets: the
          rung is carried by the dashed edge, and dimming the text as well would
          drop it toward the 4.5:1 floor that `ink-faint.test.ts` exists to hold. */}
      <h3 className="type-h3 text-ink">{title}</h3>
      <div className="type-body text-muted">{children}</div>
      <p className="type-sm text-muted">Standing on: {evidence}</p>
    </section>
  )
}

/**
 * How long, at the pace actually measured, until this account clears the floor.
 *
 * ── THIS FUNCTION RETURNS NULL FAR MORE OFTEN THAN IT RETURNS A NUMBER ───────
 * Three refusals, and each one is a figure that would otherwise be invented:
 *
 *   · fewer than `MIN_DAYS` days of record — a pace from two points is not a pace;
 *   · a net change of zero or less — there is no growth to project, and dividing
 *     by it would produce Infinity, which would render as an enormous confident
 *     number of days;
 *   · already at or past the floor — there is nothing to count down to.
 *
 * What it returns when it does speak is arithmetic anyone can check: the days
 * between the first and last stored measurement, the followers gained across them,
 * and the division. All three are shown, so the reader can disagree with it.
 */
export const MIN_DAYS_FOR_PACE = 7

export interface GrowthPace {
  perDay: number
  daysToFloor: number
  gained: number
  overDays: number
}

export function growthPace(
  days: FollowerDay[],
  floor: number,
): GrowthPace | { refused: 'too-few-days' | 'no-growth' | 'already-there'; days: number } {
  const first = days[0]
  const last = days[days.length - 1]
  if (first === undefined || last === undefined || days.length < MIN_DAYS_FOR_PACE) {
    return { refused: 'too-few-days', days: days.length }
  }
  if (last.followers >= floor) return { refused: 'already-there', days: days.length }

  const spanMs = Date.parse(`${last.day}T00:00:00Z`) - Date.parse(`${first.day}T00:00:00Z`)
  const overDays = Math.round(spanMs / 86_400_000)
  const gained = last.followers - first.followers
  if (!Number.isFinite(overDays) || overDays <= 0 || gained <= 0) {
    return { refused: 'no-growth', days: days.length }
  }

  const perDay = gained / overDays
  return {
    perDay,
    gained,
    overDays,
    daysToFloor: Math.ceil((floor - last.followers) / perDay),
  }
}

export function PaceToFloor({
  days,
  floor,
}: {
  days: FollowerDay[]
  floor: number
}) {
  const pace = growthPace(days, floor)

  if ('refused' in pace) {
    const REFUSAL: Record<typeof pace.refused, string> = {
      'too-few-days': `Sahoda needs at least ${MIN_DAYS_FOR_PACE} days of follower counts before it will estimate a pace. It has ${pace.days}.`,
      'no-growth':
        'Your follower count has not gone up across the days kept, so there is no pace to work from. This will fill in once it moves.',
      'already-there': 'You are past the threshold, so there is nothing to count down to.',
    }
    return (
      <InferredPanel
        title="How long until Instagram describes your audience"
        evidence={`${pace.days} day${pace.days === 1 ? '' : 's'} of follower counts`}
      >
        <p className="max-w-[60ch]">{REFUSAL[pace.refused]}</p>
      </InferredPanel>
    )
  }

  return (
    <InferredPanel
      title="How long until Instagram describes your audience"
      evidence={`${pace.gained} follower${pace.gained === 1 ? '' : 's'} gained over ${pace.overDays} days`}
    >
      <p className="max-w-[60ch]">
        At the pace Sahoda has measured &mdash; <span className="num">{pace.gained}</span> over{' '}
        <span className="num">{pace.overDays}</span> days &mdash; you would pass{' '}
        <span className="num">{floor}</span> followers in about{' '}
        <span className="num">{pace.daysToFloor.toLocaleString()}</span> days. That is a
        straight-line guess from a short record, not a forecast, and it will move every time
        your following does.
      </p>
    </InferredPanel>
  )
}
