import { describe, expect, it } from 'vitest'

import { AUTOPILOT_REFUSALS, AUTOPILOT_REFUSAL_COPY } from '@/lib/loop/autopilot-refusals'
import { AUTOPILOT_LEVEL, type AutopilotCandidate, type AutopilotWorld } from './decide'
import type { AnnouncedPost } from './dispatch-due'
import { runAutopilotTick } from './run'
import type { DecisionRow } from './store'

/**
 * THE NEVER-LIST, ENFORCED — Phase 2 part 6.
 *
 * ── THE GAP THIS CLOSES, NAMED BY THE SESSION THAT LEFT IT ───────────────────
 * `loop_autopilot_log.pglite.test.ts` adjudicates `AUTOPILOT_REFUSALS` against
 * the migration's comment, and its own WHAT IT CANNOT SEE section says the
 * quiet part: "a name present in both files and used by nothing would pass".
 * A never-list nothing writes is a prose list wearing a constant's clothes.
 *
 * ── WHY THIS DRIVES THE REAL TICK RATHER THAN GREPPING ───────────────────────
 * A grep proves a name is MENTIONED. This runs `runAutopilotTick` against a
 * world built to trip each guardrail and collects what actually reached
 * `writeDecision`, so it proves the name reaches a ROW. Those are different
 * claims and only the second one is worth anything: a reason held in a variable
 * and never persisted is invisible the moment somebody asks "why did autopilot
 * not post last Tuesday".
 */

const CONFIRMED_BRAIN = {
  field_meta: {
    'hook.core_promise': { confirmed: true },
    'customer_persona.primary_pain_point': { confirmed: true },
    'voice.descriptor': { confirmed: true },
    'taboo.red_lines': { confirmed: true },
  },
}

const NOW = new Date('2026-08-29T10:00:00.000Z')

function candidate(over: Partial<AutopilotCandidate> = {}): AutopilotCandidate {
  return {
    postId: 'post-1',
    variantId: 'variant-1',
    channel: 'x',
    accountId: 'acct-1',
    briefId: null,
    cycleId: null,
    gateFlagged: false,
    fitsChannel: true,
    costCredits: 0,
    ...over,
  }
}

function world(over: Partial<AutopilotWorld> = {}): AutopilotWorld {
  return {
    now: NOW,
    levelFor: () => AUTOPILOT_LEVEL,
    brainPayload: CONFIRMED_BRAIN,
    dailyCap: 3,
    publishedToday: 0,
    cancelMinutes: 30,
    weeklyBudgetRemaining: 1000,
    ...over,
  }
}

function announced(over: Partial<AnnouncedPost> = {}): AnnouncedPost {
  return {
    postId: 'due-1',
    variantId: 'variant-9',
    channel: 'x',
    accountId: 'acct-1',
    dispatchAfter: new Date('2026-08-29T09:30:00.000Z'),
    ...over,
  }
}

/** Run one tick and return every refusal_reason that reached a row. */
async function reasonsWritten(input: {
  candidates?: AutopilotCandidate[]
  pending?: AnnouncedPost[]
  world?: Partial<AutopilotWorld>
  killed?: boolean
  levelFor?: (channel: never) => number | undefined
}): Promise<string[]> {
  const written: DecisionRow[] = []
  await runAutopilotTick({
    workspaceId: 'ws-1',
    world: world(input.world),
    candidates: input.candidates ?? [],
    pending: input.pending ?? [],
    due: {
      now: NOW,
      levelFor: input.levelFor ?? (() => AUTOPILOT_LEVEL),
      killed: input.killed ?? false,
    },
    write: async (row) => {
      written.push(row)
      return 'row-id'
    },
    publish: async () => {},
  })
  return written.filter((r) => r.refusalReason).map((r) => String(r.refusalReason))
}

/**
 * The reasons that are NOT written, each with the reason it is not.
 *
 * This list is the honest half of the guard. A name that reaches no row is
 * either a defect or a deliberate silence, and the difference has to be
 * written down or the next reader cannot tell which.
 */
const NOT_PERSISTED: Record<string, string> = {
  // A post inside its cancel window is being WAITED FOR, not refused. Writing
  // a row every tick would record the fact that time had not passed yet, once
  // per tick, for every announced post — the ops_audit_log defect exactly.
  // `decideDue` returns it as a `wait`, and `runAutopilotTick` writes nothing
  // for waits. It stays in the list because it is a real reason a person may
  // be shown on a screen; it is just not a row.
  INSIDE_CANCEL_WINDOW: 'a wait, not a refusal — writing it would log the passage of time',
}

describe('every name on the never-list reaches a real row', () => {
  it('NOT_AUTOPILOT_CHANNEL, from a channel nobody armed', async () => {
    expect(
      await reasonsWritten({ candidates: [candidate()], world: { levelFor: () => 2 } }),
    ).toEqual([AUTOPILOT_REFUSALS.NOT_AUTOPILOT_CHANNEL])
  })

  it('REFUSAL_GATE, from a body the gate flagged', async () => {
    expect(await reasonsWritten({ candidates: [candidate({ gateFlagged: true })] })).toEqual([
      AUTOPILOT_REFUSALS.REFUSAL_GATE,
    ])
  })

  it('CONSTRAINT_ENGINE, from a post that does not fit the channel', async () => {
    expect(await reasonsWritten({ candidates: [candidate({ fitsChannel: false })] })).toEqual([
      AUTOPILOT_REFUSALS.CONSTRAINT_ENGINE,
    ])
  })

  it('BRAIN_BELOW_FLOOR, from a brain nobody has confirmed', async () => {
    expect(
      await reasonsWritten({ candidates: [candidate()], world: { brainPayload: null } }),
    ).toEqual([AUTOPILOT_REFUSALS.BRAIN_BELOW_FLOOR])
  })

  it('DAILY_CAP, from a day already full', async () => {
    expect(
      await reasonsWritten({
        candidates: [candidate()],
        world: { dailyCap: 1, publishedToday: 1 },
      }),
    ).toEqual([AUTOPILOT_REFUSALS.DAILY_CAP])
  })

  it('WEEKLY_BUDGET, from a post costing more than the week has left', async () => {
    expect(
      await reasonsWritten({
        candidates: [candidate({ costCredits: 10 })],
        world: { weeklyBudgetRemaining: 0 },
      }),
    ).toEqual([AUTOPILOT_REFUSALS.WEEKLY_BUDGET])
  })

  it('CANCELLED, from the kill switch stopping a due post', async () => {
    expect(await reasonsWritten({ pending: [announced()], killed: true })).toEqual([
      AUTOPILOT_REFUSALS.CANCELLED,
    ])
  })
})

describe('the list and the code cannot drift apart', () => {
  it('every name is either written by the tick or declared as deliberately silent', async () => {
    // The guard that makes this file more than eight examples. Add a ninth
    // name to AUTOPILOT_REFUSALS and this fails until something writes it or
    // NOT_PERSISTED says, in words, why it does not.
    const written = new Set(
      (
        await Promise.all([
          reasonsWritten({ candidates: [candidate()], world: { levelFor: () => 2 } }),
          reasonsWritten({ candidates: [candidate({ gateFlagged: true })] }),
          reasonsWritten({ candidates: [candidate({ fitsChannel: false })] }),
          reasonsWritten({ candidates: [candidate()], world: { brainPayload: null } }),
          reasonsWritten({
            candidates: [candidate()],
            world: { dailyCap: 1, publishedToday: 1 },
          }),
          reasonsWritten({
            candidates: [candidate({ costCredits: 10 })],
            world: { weeklyBudgetRemaining: 0 },
          }),
          reasonsWritten({ pending: [announced()], killed: true }),
        ])
      ).flat(),
    )

    const unaccounted = Object.values(AUTOPILOT_REFUSALS).filter(
      (name) => !written.has(name) && !(name in NOT_PERSISTED),
    )
    expect(
      unaccounted,
      'A refusal name that no code path writes is a never-list nobody enforces. ' +
        'Either write it, or add it to NOT_PERSISTED with the reason it is silent.',
    ).toEqual([])
  })

  it('every deliberately silent name is still a real name, so the excuse cannot outlive it', () => {
    // Removing a name from AUTOPILOT_REFUSALS while leaving it in
    // NOT_PERSISTED would leave an allowance for something that no longer
    // exists — the stale-exception shape this repository already guards
    // elsewhere.
    for (const name of Object.keys(NOT_PERSISTED)) {
      expect(Object.values(AUTOPILOT_REFUSALS)).toContain(name)
    }
  })

  it('every name a person can be shown has copy, and it says nothing went out', () => {
    for (const name of Object.values(AUTOPILOT_REFUSALS)) {
      const copy = AUTOPILOT_REFUSAL_COPY[name]
      expect(copy, `${name} has no sentence a person can read`).toBeTruthy()
      // Each is a claim about what DID NOT happen. "Sahoda did not publish"
      // and "Sahoda published and it failed" are different facts, and this
      // list must only ever make the first one.
      //
      // The first version of this assertion banned the phrase "went out"
      // outright and failed on "so nothing went out" — which is the CORRECT
      // sentence. The rule is not about a phrase, it is about a CLAIM: what
      // must never appear is an affirmative statement that the post was sent.
      expect(copy, `${name} claims the post was published`).not.toMatch(
        /\bwas published\b|\bhas been published\b|\bpublished it\b|\bwe published\b|\bhas gone out\b/i,
      )
    }
  })
})
