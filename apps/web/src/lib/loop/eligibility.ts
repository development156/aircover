import type { AutonomyLevel, Channel } from '@sahoda/shared'

import { cycleCost } from '@/lib/loop/cost'
// Always the `credits(n)` helper, never a hand-written interpolation: the
// workspace this sentence is for is, by definition, the one with a small number,
// and the singular has been got wrong twice in this codebase for that reason.
// (Written without an example, because the scanner that enforces this reads
// comments too — and would have matched the example.)
import { credits } from '@/lib/credit-words'

import { isPlannableChannel } from './plannable'
import { LOOP_SCHEDULE_PHRASE } from './schedule'

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

// The channels the Loop plans for come from `./plannable`, derived from the
// shared enum. This file carried its own four-channel literal, which refused a
// Facebook or Telegram workspace that `actions/loop-cycle.ts` planned for.

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

/**
 * The Brand Brain, as eligibility needs it.
 *
 * `resolved` is whether an ACTIVE `brand_memory` row exists at all. It is the
 * one that blocks: `packages/mesh` injects the brand prefix from that row and
 * `brand-context.ts` returns null without it, so a workspace with no brain is
 * planned for at the full price with a generic, ungrounded prompt — a week of
 * posts about somebody's business written from nothing.
 *
 * `confirmed` out of `total` is the confirmation ring, and it does NOT block.
 * MEASURED against production 2026-08-28: all five workspaces that have opened
 * the Loop have an active brain, and four of them have zero confirmed fields.
 * Refusing those would refuse almost the whole fleet for a state that is
 * legitimate at L1, where a person reads every draft before it goes anywhere.
 * It rides as an advisory instead. The confirmed FLOOR belongs to L3, where
 * nobody is reading.
 */
export interface BrainFact {
  resolved: boolean
  confirmed: number
  total: number
}

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
  /** The Brand Brain. See `BrainFact` for which half blocks and which advises. */
  brain: BrainFact
}

export type LoopRefusal =
  | { reason: 'never_enabled' }
  | { reason: 'paused' }
  | { reason: 'no_channel' }
  | { reason: 'channel_lapsed'; lapsed: readonly Channel[] }
  | { reason: 'already_planned'; cycleId: string; isoYear: number; isoWeek: number }
  | { reason: 'insufficient_credits'; available: number; required: number }
  | { reason: 'brain_not_resolved' }

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
  /**
   * True when a brain exists but nobody has confirmed a single field of it.
   *
   * Not a refusal — see `BrainFact`. It is said out loud because the week will
   * be written in a voice the model guessed and the customer has never agreed
   * to, and a person who is told that reads the drafts differently.
   */
  brainUnconfirmed: boolean
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

  // Above the channel check, because it is the more foundational absence and
  // the one the product's own onboarding resolves first: a brain is what every
  // channel's posts are written FROM. Sending somebody to connect Instagram
  // when Sahoda knows nothing about their business fixes the second problem.
  if (!facts.brain.resolved) return no({ reason: 'brain_not_resolved' })

  const channels = facts.connections
    .filter((c) => c.status === PLANNABLE_STATUS)
    .map((c) => c.platform)
    .filter(isPlannableChannel)
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
          .filter(isPlannableChannel),
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
    advisory: {
      suggestOnly: governingLevel === 0,
      governingLevel,
      brainUnconfirmed: facts.brain.confirmed === 0,
    },
  }
}

const CHANNEL_NAMES: Record<Channel, string> = {
  x: 'X',
  gbp: 'Google Business Profile',
  linkedin: 'LinkedIn',
  instagram: 'Instagram',
  facebook: 'Facebook Pages',
  telegram: 'Telegram',
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
/**
 * Whether the Sunday schedule is armed in this environment.
 *
 * `armed` is the state every sentence below was written for. `off` means
 * `SAHODA_LOOP_CRON_MODE` is not `on`, so `api/cron/loop/route.ts` returns
 * before reading anything and NO cycle is ever opened automatically, for any
 * workspace, however eligible.
 *
 * It is a separate argument rather than a fact on the verdict because it is not
 * a fact about the workspace: `assess()` answers "would the Loop plan for this
 * business", and this answers "is anything going to ask it on Sunday". Folding
 * the two together would let a system-wide outage read as the customer's own
 * settings being wrong.
 */
export interface ExplainOptions {
  autoSchedule: 'armed' | 'off'
}

/**
 * What a reader is owed when nothing is going to run on Sunday.
 *
 * TWO of them, and which one is used depends on whether the button on that
 * screen can actually be pressed. `controls.tsx:154` disables planning while
 * `paused || !hasChannels || cycleRunning`, so "plan yours here whenever you
 * want one" was offering a greyed-out control to exactly the two verdicts whose
 * text is rewritten above it. That is the `no-impossible-remedy` class, and the
 * workspace's own sentence already carries the step that comes first.
 */
const NO_AUTO_SCHEDULE_PLAIN = 'Sahoda is not planning weeks automatically at the moment.'
const NO_AUTO_SCHEDULE_WITH_REMEDY =
  'Sahoda is not planning weeks automatically at the moment, so plan yours here whenever you want one.'

/**
 * Whether the plan-a-week button on `/loop` can be pressed from this verdict.
 *
 * Mirrors `controls.tsx`'s own `disabled` expression. Enumerated rather than
 * defaulted so that a NEW refusal reason fails the build here and forces
 * somebody to decide, which is how the `insufficient_credits` leak below got in.
 */
function canPlanByHand(verdict: LoopVerdict): boolean {
  if (verdict.eligible) return true
  switch (verdict.reason) {
    // `disabled={paused || ...}` and `... || !hasChannels`.
    case 'paused':
    case 'no_channel':
      return false
    case 'never_enabled':
    case 'channel_lapsed':
    case 'already_planned':
    case 'insufficient_credits':
    case 'brain_not_resolved':
      return true
  }
}

export function explain(verdict: LoopVerdict, options?: ExplainOptions): string {
  // ── THE PROMISE THAT NOTHING CHECKED ──────────────────────────────────────
  // Every sentence below promises a plan "every Sunday", and until this argument
  // existed none of them could know whether anything runs on Sunday. The switch
  // defaults OFF on purpose, because the job spends 20 credits per workspace and
  // no deploy may start charging people who never opened this screen. So the
  // promise was made most loudly in exactly the state where it was least true.
  //
  // The workspace's own reason is kept and this is added to it: a paused Loop is
  // still paused, and swapping one wrong sentence for a different wrong sentence
  // would be no fix at all.
  if (options?.autoSchedule === 'off') {
    const tail = canPlanByHand(verdict) ? NO_AUTO_SCHEDULE_WITH_REMEDY : NO_AUTO_SCHEDULE_PLAIN
    return `${withoutSundayPromise(verdict)} ${tail}`
  }
  return explainArmed(verdict)
}

/**
 * The workspace's own reason, with any claim about automatic weekly planning
 * removed — never with the reason itself removed.
 */
function withoutSundayPromise(verdict: LoopVerdict): string {
  if (verdict.eligible) {
    const channels = list(verdict.channels)
    const base = verdict.advisory.suggestOnly
      ? `A week planned here would cover ${channels}, as suggestions. Every channel is set to suggest only.`
      : `A week planned here would cover ${channels}.`
    return verdict.advisory.brainUnconfirmed
      ? `${base} Nothing in your Brand Brain is confirmed yet, so it will write in a voice it guessed at.`
      : base
  }
  // ── EVERY REASON, NAMED. NO `default:` ──────────────────────────────────────
  // This switch used to end in `default: return explainArmed(verdict)` under a
  // comment asserting "every other reason says nothing about Sunday". Two of
  // them did. `insufficient_credits` returns "Top up and Sahoda will plan your
  // next week", so with the cron off a workspace short on credits was told
  // "...Sahoda will plan your next week. Sahoda is not planning weeks
  // automatically at the moment" — the promise this whole option exists to
  // remove, and a self-contradiction inside one string.
  //
  // The suite's own `promisesSunday` regex matched it. It was never pointed at
  // this verdict: `auto-schedule.test.ts` exercised only never_enabled, paused
  // and eligible.
  //
  // Exhaustive on purpose. A new reason must fail to compile here rather than
  // fall through to a sentence written for an armed schedule.
  switch (verdict.reason) {
    case 'never_enabled':
      return 'Turn the Loop on to plan a week here.'
    case 'paused':
      return 'The Loop is paused. Resume it to plan a week here.'
    case 'insufficient_credits':
      // WAS "Top up and Sahoda will plan your next week."
      return `Planning a week costs ${credits(verdict.required)} and you have ${credits(verdict.available)}. Top up to plan one here.`
    case 'channel_lapsed': {
      // WAS "...and Sahoda has somewhere to plan for again", which reads as the
      // Loop resuming on its own.
      const has = verdict.lapsed.length === 1 ? 'connection has' : 'connections have'
      const them = verdict.lapsed.length === 1 ? 'it' : 'them'
      return `Your ${list(verdict.lapsed)} ${has} lapsed. Reconnect ${them} to plan a week here.`
    }
    case 'brain_not_resolved':
      // "it can plan a week" is a capability rather than a schedule, and it stays
      // true with the cron off, so this one is carried over unchanged.
      return explainArmed(verdict)
    case 'no_channel':
    case 'already_planned':
      // Neither says anything about Sunday. `no_channel` states a missing
      // prerequisite; `already_planned` is in the past tense.
      return explainArmed(verdict)
  }
}

function explainArmed(verdict: LoopVerdict): string {
  // NO EM DASH IN ANY SENTENCE BELOW. These were written when the only reader
  // was the cron's JSON, and they now render on /loop — where the founder's
  // 2026-08-23 ruling applies: a dash joining two independent clauses becomes a
  // full stop. The clauses are unchanged; splitting them costs no precision,
  // which is the test that ruling has to pass.
  if (verdict.eligible) {
    const plan = verdict.advisory.suggestOnly
      ? `Sahoda will plan your week for ${list(verdict.channels)}, as suggestions. Every channel is set to suggest only.`
      : `Sahoda will plan your week for ${list(verdict.channels)}.`
    // Said on the ELIGIBLE sentence rather than withheld: the week is going to
    // be written in a voice the model guessed at, and a person who knows that
    // reads the drafts differently. MEASURED 2026-08-28: four of the five
    // workspaces that have opened the Loop are in this state.
    return verdict.advisory.brainUnconfirmed
      ? `${plan} Nothing in your Brand Brain is confirmed yet, so it will write in a voice it guessed at.`
      : plan
  }
  switch (verdict.reason) {
    case 'never_enabled':
      // The day comes from the deployment's cron, never typed here. Moving the
      // schedule used to leave this sentence naming the old day for ever.
      return `Turn the Loop on and Sahoda will plan your week ${LOOP_SCHEDULE_PHRASE}.`
    case 'paused':
      return 'The Loop is paused. Resume it and Sahoda will plan your next week.'
    case 'no_channel':
      return 'Connect a channel first. Sahoda has nowhere to plan for.'
    case 'channel_lapsed': {
      const has = verdict.lapsed.length === 1 ? 'connection has' : 'connections have'
      const them = verdict.lapsed.length === 1 ? 'it' : 'them'
      return `Your ${list(verdict.lapsed)} ${has} lapsed. Reconnect ${them} and Sahoda has somewhere to plan for again.`
    }
    case 'already_planned':
      return `Sahoda already planned week ${verdict.isoWeek} of ${verdict.isoYear}. Open it to review this week's briefs.`
    case 'insufficient_credits':
      return `Planning a week costs ${credits(verdict.required)} and you have ${credits(verdict.available)}. Top up and Sahoda will plan your next week.`
    case 'brain_not_resolved':
      return 'Sahoda does not know your business yet. Build your Brand Brain and it can plan a week that sounds like you.'
  }
}

/**
 * WHERE A PERSON GOES TO FIX IT, and never anywhere that cannot fix it.
 *
 * Every remedy here is a route that exists and an action that can succeed from
 * the state the reason describes. `no-impossible-remedy.spec.ts` walks the app
 * as a fresh account and fails on the other kind — a reload offered for a
 * missing workspace, a "connect" offered to somebody whose connection lapsed.
 *
 * The two in-page anchors are remedies too: the Loop's own controls and the
 * cycle already on the screen. `already_planned` is the reason that most needs
 * one, because its sentence says "open it" and the thing to open is further
 * down the same page — a link to nowhere would make that sentence false.
 *
 * Null for an eligible verdict. There is nothing to remedy.
 */
export function remedy(verdict: LoopVerdict): { href: string; label: string } | null {
  if (verdict.eligible) return null
  switch (verdict.reason) {
    case 'never_enabled':
    case 'paused':
      return { href: '#loop-controls', label: 'Turn the Loop on' }
    case 'no_channel':
      return { href: '/connections', label: 'Connect a channel' }
    case 'channel_lapsed':
      return { href: '/connections', label: 'Reconnect it' }
    case 'already_planned':
      return { href: '#loop-current', label: 'Review this week' }
    case 'insufficient_credits':
      return { href: '/wallet', label: 'Top up' }
    case 'brain_not_resolved':
      return { href: '/brain', label: 'Build your Brand Brain' }
  }
}
