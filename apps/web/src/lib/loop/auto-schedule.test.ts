import { describe, it, expect } from 'vitest'

import { explain, type LoopVerdict } from './eligibility'

/**
 * WHAT /loop MAY PROMISE WHEN THE SUNDAY SCHEDULE IS SWITCHED OFF.
 *
 * ── THE DEFECT ───────────────────────────────────────────────────────────────
 * `SAHODA_LOOP_CRON_MODE` defaults OFF, deliberately: the Sunday job spends 20
 * credits per workspace, so a deploy must never start charging people who have
 * never opened the screen. `api/cron/loop/route.ts` short-circuits before it
 * reads anything when the switch is not the literal `on`.
 *
 * Nothing on /loop ever consulted that switch. So a workspace that has not
 * enabled the Loop was told "Turn the Loop on and Sahoda will plan your week
 * every Sunday" — a conditional promise, with a remedy button that fulfils the
 * condition and produces nothing. The customer turns it on, waits for Sunday,
 * and no cycle is ever opened. Nothing anywhere says why, because nothing
 * anywhere knows to ask.
 *
 * MEASURED: `assess()` checks `settings === null` FIRST, before paused, brain,
 * channels and credits, so that sentence is what most of the fleet sees.
 *
 * ── WHAT THIS PINS ───────────────────────────────────────────────────────────
 * The CLAIM, not the wording: rewrite these sentences freely. What may never
 * come back is a sentence promising automatic weekly planning while the thing
 * that would do it is switched off, and a screen that cannot tell a customer
 * which of the two situations they are in.
 */

const NEVER_ENABLED: LoopVerdict = {
  eligible: false,
  reason: 'never_enabled',
  channels: [],
  lapsed: [],
  advisory: { suggestOnly: false, brainUnconfirmed: false },
} as unknown as LoopVerdict

const PAUSED: LoopVerdict = { ...NEVER_ENABLED, reason: 'paused' } as unknown as LoopVerdict

const ELIGIBLE: LoopVerdict = {
  eligible: true,
  channels: ['instagram'],
  lapsed: [],
  advisory: { suggestOnly: false, brainUnconfirmed: false },
} as unknown as LoopVerdict

/**
 * ── THE FIVE THIS SUITE NEVER ASKED ─────────────────────────────────────────
 * The regex below matched `insufficient_credits` all along. It was never handed
 * one: the loops ran over never_enabled, paused and eligible, and
 * `withoutSundayPromise` sent everything else to a `default:` that returned the
 * ARMED sentence. So a workspace short on credits was told "Top up and Sahoda
 * will plan your next week. Sahoda is not planning weeks automatically at the
 * moment." A guard that is never pointed at the case that breaks it is not a
 * guard, which is the whole reason these five exist.
 */
const INSUFFICIENT: LoopVerdict = {
  ...NEVER_ENABLED,
  reason: 'insufficient_credits',
  required: 20,
  available: 2,
} as unknown as LoopVerdict

const LAPSED: LoopVerdict = {
  ...NEVER_ENABLED,
  reason: 'channel_lapsed',
  lapsed: ['instagram'],
} as unknown as LoopVerdict

const NO_CHANNEL: LoopVerdict = { ...NEVER_ENABLED, reason: 'no_channel' } as unknown as LoopVerdict

const ALREADY: LoopVerdict = {
  ...NEVER_ENABLED,
  reason: 'already_planned',
  isoWeek: 35,
  isoYear: 2026,
} as unknown as LoopVerdict

const NO_BRAIN: LoopVerdict = {
  ...NEVER_ENABLED,
  reason: 'brain_not_resolved',
} as unknown as LoopVerdict

/** Every verdict `explain` can be handed. Nothing may be left out of the loops. */
const EVERY_VERDICT: readonly LoopVerdict[] = [
  NEVER_ENABLED,
  PAUSED,
  ELIGIBLE,
  INSUFFICIENT,
  LAPSED,
  NO_CHANNEL,
  ALREADY,
  NO_BRAIN,
]

/**
 * The two whose plan button `controls.tsx:154` disables. Offering them "plan
 * yours here whenever you want one" points at a greyed-out control.
 */
const CANNOT_PLAN_BY_HAND: readonly LoopVerdict[] = [PAUSED, NO_CHANNEL]

/** Everything the automatic schedule promises, in the words a reader would search for. */
const promisesSunday = (sentence: string): boolean =>
  /\bevery sunday\b/i.test(sentence) || /\bwill plan your (week|next week)\b/i.test(sentence)

describe('when the Sunday schedule is armed', () => {
  it('still promises the weekly plan, because it is true', () => {
    expect(promisesSunday(explain(NEVER_ENABLED, { autoSchedule: 'armed' }))).toBe(true)
    expect(promisesSunday(explain(PAUSED, { autoSchedule: 'armed' }))).toBe(true)
    expect(promisesSunday(explain(ELIGIBLE, { autoSchedule: 'armed' }))).toBe(true)
  })

  it('reads exactly as it did before this option existed', () => {
    // The armed case is the one that was already correct. A change that quietly
    // reworded it would be this fix breaking the thing it came to protect.
    for (const v of [NEVER_ENABLED, PAUSED, ELIGIBLE]) {
      expect(explain(v, { autoSchedule: 'armed' })).toBe(explain(v))
    }
  })
})

describe('when the Sunday schedule is switched off', () => {
  it('promises no automatic plan, on every sentence that used to', () => {
    for (const v of EVERY_VERDICT) {
      expect(promisesSunday(explain(v, { autoSchedule: 'off' }))).toBe(false)
    }
  })

  it('says the automatic weekly planning is off, rather than going quiet', () => {
    // Silence would be a smaller lie and still a lie: the customer is left
    // expecting a Sunday that never comes. The sentence has to name the state.
    for (const v of EVERY_VERDICT) {
      expect(explain(v, { autoSchedule: 'off' })).toMatch(/not planning weeks automatically/i)
    }
  })

  it('offers the remedy that does work, which is planning it yourself', () => {
    // Never leave a person with a problem and no next step. "Plan my week" is on
    // the same screen and does not consult the switch, so it works while the
    // schedule is off — that is the one true thing to point at.
    for (const v of EVERY_VERDICT.filter((one) => !CANNOT_PLAN_BY_HAND.includes(one))) {
      // The claim, not a phrasing: the sentence must point at planning a week
      // from this screen, which is the thing that still works.
      expect(explain(v, { autoSchedule: 'off' })).toMatch(/plan (yours|it|a week|your week|one)/i)
    }
  })

  it('does not offer a button this screen has disabled', () => {
    // ── THE OTHER HALF, AND THIS SUITE USED TO PIN THE DEFECT ────────────────
    // The test above asserted `/plan (yours|it|a week|your week)/` for PAUSED
    // specifically, so a new guard was endorsing a remedy the same screen greys
    // out. `controls.tsx:154` is `disabled={paused || !hasChannels ||
    // cycleRunning}`, so for these two the offer cannot be taken.
    for (const v of CANNOT_PLAN_BY_HAND) {
      expect(explain(v, { autoSchedule: 'off' })).not.toMatch(/plan yours here whenever/i)
    }
  })

  it('still names the step that comes first for those two', () => {
    // Removing the impossible offer must not leave them with nothing. Their own
    // reason carries the action that IS available: resume, or connect.
    expect(explain(PAUSED, { autoSchedule: 'off' })).toMatch(/resume/i)
    expect(explain(NO_CHANNEL, { autoSchedule: 'off' })).toMatch(/connect a channel/i)
  })

  it('keeps whatever else was wrong with the workspace', () => {
    // The switch being off does not stop a paused Loop being paused. Replacing
    // the workspace's own reason with the system one would trade a wrong
    // sentence for a different wrong sentence.
    expect(explain(PAUSED, { autoSchedule: 'off' })).toMatch(/paused/i)
  })
})
