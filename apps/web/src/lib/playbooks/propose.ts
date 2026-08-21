import {
  FestivalParamsSchema,
  upcomingFestivals,
  type AutonomyLevel,
  type Channel,
} from '@sahoda/shared'

import { governingLevel } from '@/lib/loop/governing-level'
import { itemCost } from './cost'
import type { ProposedItem } from './store'

/**
 * THE PROPOSAL STEP — what a run WOULD make, priced, before anything is spent.
 *
 * ── THIS HALF IS DETERMINISTIC ON PURPOSE ────────────────────────────────────
 * It reads a calendar and does arithmetic. No model is called, no provider is
 * touched, and nothing is charged. That is what lets the whole cost sit AFTER the
 * halt rather than straddling it: the Loop has to spend its orchestration charge
 * to think about the week, so its preview can only ever cover what comes next,
 * but a Playbook has no honest reason to take money before the number has been
 * seen.
 *
 * ── AND WHY IT IS A PURE FUNCTION ────────────────────────────────────────────
 * `now` and the dial are arguments. A festival proposer that read the clock
 * itself could only be tested in December, and the December case — the window
 * that has to wrap into next year — is the one most likely to be wrong.
 */

export interface Proposal {
  items: ProposedItem[]
  /** Why this run happened, in the recipe's own vocabulary. Stored on the run. */
  triggerDetail: Record<string, unknown>
}

/**
 * The festival calendar's proposal.
 *
 * Returns an EMPTY item list when nothing falls in the window, which the caller
 * turns into `nothing_to_do`. That is an ending, not a failure: a scheduled run
 * on an ordinary Tuesday in March did its job by finding nothing, and charging
 * for it — or filing it beside the failures — would each be a lie of a different
 * kind.
 */
export function proposeFestivals(
  params: unknown,
  dial: Map<Channel, AutonomyLevel>,
  outputAction: Parameters<typeof itemCost>[0],
  now: Date,
): Proposal {
  const parsed = FestivalParamsSchema.parse(params)
  const channels = [...parsed.channels]
  const level = governingLevel(channels, dial)
  const found = upcomingFestivals(now, parsed.lead_days, parsed.calendars)

  const items: ProposedItem[] = found.map((festival) => ({
    title: festival.name,
    body:
      `${festival.name} falls on ${festival.occursOn.toISOString().slice(0, 10)}. ` +
      `Write one post for it, in the business's own voice — ${festival.angle}. ` +
      `Say something only this business could say; a stock greeting is worse than silence.`,
    channels,
    // A DAY BEFORE THE FESTIVAL, at the same hour the run happened. Not the day
    // itself: a post that lands on the morning of a holiday was decided the night
    // before by everyone else too, and the point of days of warning is to arrive
    // while there is still time to change it.
    suggestedSlot: new Date(festival.occursOn.getTime() - 86_400_000).toISOString(),
    estimatedCredits: itemCost(outputAction, level),
  }))

  return {
    items,
    triggerDetail: {
      kind: 'festival_calendar',
      // The FESTIVALS, named. "Why did this run" has to be answerable from the
      // row alone, months later, by somebody looking at a charge.
      festivals: found.map((f) => ({ key: f.key, on: f.occursOn.toISOString().slice(0, 10) })),
      lead_days: parsed.lead_days,
      calendars: parsed.calendars,
      // The level the prices were computed at, so a preview approved last week
      // can be read against the dial that was in force then.
      autonomy_level: level,
    },
  }
}
