import type { AutonomyLevel, Channel } from '@sahoda/shared'

import { cycleCost } from '@/lib/loop/cost'
// Always the `credits(n)` helper, never a hand-written interpolation: the
// workspace this sentence is for is, by definition, the one with a small number,
// and the singular has been got wrong twice in this codebase for that reason.
// (Written without an example, because the scanner that enforces this reads
// comments too — and would have matched the example.)
import { credits } from '@/lib/credit-words'

/**
 * WHY THE LOOP WILL NOT PLAN FOR A WORKSPACE — one named cause, never a boolean.
 *
 * ── THE MEASUREMENT THAT MADE THIS NECESSARY ─────────────────────────────────
 * The scheduled cycle was armed and run end to end. It reported
 * `eligible: 1, planned: 0`, and that is not a bug — it is the truth. TWO
 * workspaces in production have ever opened the Loop screen. The one with it ON
 * has no channels and no credits; the one with two live channels and 1,260
 * credits has it PAUSED.
 *
 * So nothing was wrong, and nothing said so. A workspace that will never be
 * planned for should be able to find out why, and "why" is not a number.
 *
 * ── ONE REASON PER CAUSE, AND WHY THAT IS THE WHOLE POINT ────────────────────
 * `runScheduledLoopCycles` had five different ways to decline and all five
 * returned `false`. `planOneWorkspace` returns false for "no channels", for
 * "already open this week", and for "the charge failed" — three completely
 * different conversations with a customer, compressed into one bit that reaches
 * nobody.
 *
 * A test can only hold what the code distinguishes. `expect(result.ok).toBe(false)`
 * passes for every branch including the ones that are wrong, which is exactly how
 * three of four refusal tests in this repo passed WITH THE GUARD DELETED. The
 * reason CODE is what a test asserts and the SENTENCE is what a person reads.
 *
 * ── THE FACTS ARE AN ARGUMENT, NOT A QUERY ───────────────────────────────────
 * `assess` takes facts and returns a verdict. It opens no connection, so every
 * branch is reachable in a unit test by constructing the state rather than by
 * building a workspace in a database and hoping it lands in the shape intended.
 * `readLoopFacts` does the I/O, separately, and is the only part that needs one.
 */

/** The four channels the Loop can plan for. */
const PLANNABLE: readonly Channel[] = ['x', 'gbp', 'linkedin', 'instagram']

/**
 * The connection status a channel must hold to be planned for.
 *
 * `active` is what `upsert_connection` writes and one of four the CHECK admits
 * ('active','expired','revoked','error'). An earlier version of the cron asked
 * for 'connected', which the column cannot hold, so it skipped EVERY workspace
 * on every run and looked exactly like a fleet with no channels.
 */
export const PLANNABLE_STATUS = 'active'

/** Statuses that mean "this was connected and no longer works" — reconnectable. */
const LAPSED_STATUSES = new Set(['expired', 'revoked', 'error'])

export interface LoopSettingsFact {
  paused: boolean
  weeklyBudgetCredits: number
}

export interface ConnectionFact {
  platform: string
  status: string
}

export interface LoopFacts {
  workspaceId: string
  /** null means NO `loop_settings` ROW — the workspace has never opened the Loop. */
  settings: LoopSettingsFact | null
  connections: readonly ConnectionFact[]
  /** Available credits, i.e. total minus held. */
  availableCredits: number
  planningWeek: { isoYear: number; isoWeek: number }
  /** A non-terminal cycle already open for `planningWeek`, if there is one. */
  openCycle: { id: string; status: string } | null
  /** The autonomy dial, per channel. Absent channels fall back to L1. */
  dial: readonly { channel: Channel; level: AutonomyLevel }[]
}

export type LoopRefusal =
  | { reason: 'never_enabled' }
  | { reason: 'paused' }
  | { reason: 'no_channel' }
  | { reason: 'channel_lapsed'; lapsed: readonly Channel[] }
  | { reason: 'already_planned'; cycleId: string; isoYear: number; isoWeek: number }
  | { reason: 'insufficient_credits'; available: number; required: number }

export type LoopRefusalReason = LoopRefusal['reason']

/**
 * L0 IS NOT A REFUSAL, AND THAT WAS CHECKED RATHER THAN ASSUMED.
 *
 * The autonomy level decides WHERE a brief lands, not whether planning happens:
 * L0 suggests, L1 drafts, L2 schedules. A workspace at L0 on every channel still
 * gets a planned week — it just actions it by hand. Nothing in the cron consults
 * the dial today, and that is correct rather than an omission.
 *
 * It is still worth SAYING, because a customer at L0 everywhere who is told
 * "your week is planned" and finds nothing in their drafts has been misled. So
 * it rides as an advisory on an ELIGIBLE verdict, never as a reason to decline.
 */
export interface LoopAdvisory {
  /** True when every plannable channel is at L0, so the week will only suggest. */
  suggestOnly: boolean
  /** The lowest level across the workspace's connected channels. */
  governingLevel: AutonomyLevel
}

export type LoopVerdict =
  | {
      eligible: true
      workspaceId: string
      channels: readonly Channel[]
      weeklyBudgetCredits: number
      advisory: LoopAdvisory
    }
  | ({ eligible: false; workspaceId: string } & LoopRefusal)

/**
 * The order the causes are tested in, and why it is this order.
 *
 * Each answers a different question, and a workspace can be in several states at
 * once. The one reported is the one the customer would have to fix FIRST:
 *
 *   never_enabled        nothing else matters; there is no Loop here yet
 *   paused               they turned it off; every later cause is moot
 *   no_channel / lapsed  there is nowhere to plan for
 *   already_planned      it DID plan — this is an answer, not a problem
 *   insufficient_credits the only one that is about money
 *
 * `already_planned` sits above credits deliberately: a workspace that was planned
 * on Sunday and spent its balance on Monday is not short of credits for this
 * week's plan, and saying so would send someone to buy credits they do not need.
 */
export function assess(facts: LoopFacts): LoopVerdict {
  const no = (r: LoopRefusal): LoopVerdict => ({
    eligible: false,
    workspaceId: facts.workspaceId,
    ...r,
  })

  if (facts.settings === null) return no({ reason: 'never_enabled' })
  if (facts.settings.paused) return no({ reason: 'paused' })

  const channels = facts.connections
    .filter((c) => c.status === PLANNABLE_STATUS)
    .map((c) => c.platform)
    .filter((p): p is Channel => (PLANNABLE as readonly string[]).includes(p))
  const unique = [...new Set(channels)]

  if (unique.length === 0) {
    // A workspace that HAD a channel and lost it needs to RECONNECT, not to
    // connect. Sending the second to do the first tells somebody something
    // untrue about their own account, and it is the likelier case: production
    // on 2026-08-22 held 4 `expired` connections against 2 `active` ones.
    const lapsed = [
      ...new Set(
        facts.connections
          .filter((c) => LAPSED_STATUSES.has(c.status))
          .map((c) => c.platform)
          .filter((p): p is Channel => (PLANNABLE as readonly string[]).includes(p)),
      ),
    ]
    return lapsed.length > 0
      ? no({ reason: 'channel_lapsed', lapsed })
      : no({ reason: 'no_channel' })
  }

  if (facts.openCycle) {
    return no({
      reason: 'already_planned',
      cycleId: facts.openCycle.id,
      isoYear: facts.planningWeek.isoYear,
      isoWeek: facts.planningWeek.isoWeek,
    })
  }

  // ── THE ONE BRANCH THAT IS A BEHAVIOUR CHANGE, AND IT IS SAID OUT LOUD ─────
  // Until now a workspace with no credits opened a cycle, ran collect and
  // reflect, wrote learnings, and only then discovered it could not pay for the
  // plan — leaving a `failed` cycle behind for a reason that was knowable before
  // any of it started. Checking first costs one number and leaves no wreckage.
  const required = cycleCost()
  if (facts.availableCredits < required) {
    return no({ reason: 'insufficient_credits', available: facts.availableCredits, required })
  }

  const levels = unique.map(
    (c) => facts.dial.find((d) => d.channel === c)?.level ?? (1 as AutonomyLevel),
  )
  const governingLevel = levels.reduce<AutonomyLevel>(
    (lowest, level) => (level < lowest ? level : lowest),
    2 as AutonomyLevel,
  )

  return {
    eligible: true,
    workspaceId: facts.workspaceId,
    channels: unique,
    weeklyBudgetCredits: facts.settings.weeklyBudgetCredits,
    advisory: { suggestOnly: governingLevel === 0, governingLevel },
  }
}

const CHANNEL_NAMES: Record<Channel, string> = {
  x: 'X',
  gbp: 'Google Business Profile',
  linkedin: 'LinkedIn',
  instagram: 'Instagram',
}

function list(channels: readonly Channel[]): string {
  const names = channels.map((c) => CHANNEL_NAMES[c])
  if (names.length <= 1) return names[0] ?? ''
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
}

/**
 * The sentence a person reads. Verb-first where there is something to do.
 *
 * This is what the tests assert. A reason code can be renamed by a refactor and
 * every `toBe(false)` assertion still passes; the sentence is the thing that
 * would actually be wrong on somebody's screen.
 */
export function explain(verdict: LoopVerdict): string {
  if (verdict.eligible) {
    return verdict.advisory.suggestOnly
      ? `Sahoda will plan your week for ${list(verdict.channels)}, as suggestions — every channel is set to suggest only.`
      : `Sahoda will plan your week for ${list(verdict.channels)}.`
  }
  switch (verdict.reason) {
    case 'never_enabled':
      return 'Turn the Loop on and Sahoda will plan your week every Sunday.'
    case 'paused':
      return 'The Loop is paused — resume it and Sahoda will plan your next week.'
    case 'no_channel':
      return 'Connect a channel first — Sahoda has nowhere to plan for.'
    case 'channel_lapsed': {
      const has = verdict.lapsed.length === 1 ? 'connection has' : 'connections have'
      const them = verdict.lapsed.length === 1 ? 'it' : 'them'
      return `Your ${list(verdict.lapsed)} ${has} lapsed — reconnect ${them} and Sahoda has somewhere to plan for again.`
    }
    case 'already_planned':
      return `Sahoda already planned week ${verdict.isoWeek} of ${verdict.isoYear} — open it to review this week's briefs.`
    case 'insufficient_credits':
      return `Planning a week costs ${credits(verdict.required)} and you have ${credits(verdict.available)} — top up and Sahoda will plan your next week.`
  }
}
