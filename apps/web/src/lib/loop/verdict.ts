import type { AutonomyLevel, Channel } from '@sahoda/shared'

import { assess, type LoopFacts, type LoopVerdict } from '@/lib/loop/eligibility'
import { planningWeekFor } from '@/lib/loop/iso-week'
import type { LoopSnapshot } from '@/lib/loop/read'

/**
 * WHAT THE LOOP WILL DO NEXT SUNDAY, FOR THE PERSON LOOKING AT THE SCREEN.
 *
 * ── WHY THIS EXISTS SEPARATELY FROM THE CRON ─────────────────────────────────
 * `assess()` was written for the scheduled tick and, until now, only the tick
 * called it. So the fleet's own screen could not answer the question the
 * function exists to answer: /loop showed a "Plan my week" button that was
 * disabled for four different causes and named two of them, in words that were
 * not the words the cron used for the same state.
 *
 * MEASURED against production 2026-08-28 — every workspace that has ever opened
 * the Loop, and what it would have been told:
 *
 *     3 workspaces   no channel connected      "Connect a channel first"
 *     2 workspaces   paused                    "The Loop is paused"
 *     0 workspaces   eligible
 *
 * Not one of those five sentences reached a screen. The button was simply off.
 *
 * ── THE FACTS COME FROM THE SNAPSHOT THE PAGE ALREADY READ ───────────────────
 * No new query. `readLoopSnapshot` gathers all of it; this only rearranges it
 * into the argument `assess()` takes, so the screen and the cron reach the same
 * verdict from the same rules rather than from two hand-written ladders that
 * drift.
 *
 * ── THE ONE FACT THAT IS NOT THE CRON'S ──────────────────────────────────────
 * The cron looks at the week it is about to plan. A person on Tuesday is asking
 * about the same week the cron would open, so `planningWeekFor(now)` is right
 * for both, and the open cycle the snapshot carries is compared against it —
 * which is what makes `already_planned` true on the screen exactly when it is
 * true for the tick.
 */
export function loopVerdict(snapshot: LoopSnapshot, now: Date): LoopVerdict {
  const week = planningWeekFor(now)

  // A cycle counts as this week's only when it IS this week's. The snapshot
  // holds the most recent cycle whatever week it belongs to, so a workspace
  // whose last cycle was in week 34 must not be told week 35 is already planned.
  const openCycle =
    snapshot.cycle &&
    snapshot.cycle.isoYear === week.isoYear &&
    snapshot.cycle.isoWeek === week.isoWeek &&
    snapshot.cycle.status !== 'cancelled' &&
    snapshot.cycle.status !== 'failed'
      ? { id: snapshot.cycle.id, status: snapshot.cycle.status }
      : null

  const facts: LoopFacts = {
    workspaceId: '',
    settings: snapshot.enabled
      ? { paused: snapshot.paused, weeklyBudgetCredits: snapshot.weeklyBudgetCredits }
      : null,
    // Both vocabularies, because `channel_lapsed` is derived from the statuses
    // and a list of live channels alone cannot distinguish "never connected"
    // from "connected and expired" — the two remedies this screen must not swap.
    connections: [
      ...snapshot.connected.map((platform: Channel) => ({ platform, status: 'active' })),
      ...snapshot.lapsed.map((platform: Channel) => ({ platform, status: 'expired' })),
    ],
    availableCredits: snapshot.availableCredits,
    planningWeek: { isoYear: week.isoYear, isoWeek: week.isoWeek },
    openCycle,
    dial: [...snapshot.dial.entries()].map(([channel, level]) => ({
      channel,
      level: level as AutonomyLevel,
    })),
    brain: snapshot.brain,
  }

  return assess(facts)
}
