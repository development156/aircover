import { describe, expect, it } from 'vitest'

import { autopilotRefusalMessage } from '@/lib/loop/autopilot-refusal-copy'

/**
 * THE THREE REFUSALS THE DATABASE RAISES, AS SENTENCES SOMEBODY WROTE.
 *
 * `AutonomyLevelSchema` used to stop at 2, and its header said why: a schema
 * that accepted a 3 would let the value reach the database and come back as a
 * raw constraint violation rather than as a refusal anyone authored. Opening
 * that union is exactly the change that would have caused it, so this file is
 * the other half of it.
 *
 * Every assertion checks the CLAIM through a lowercase substring, never the
 * wording. Rewrite any sentence freely; what must not change is that each named
 * refusal says what is missing, and that none of them shows a customer an
 * internal field path or tells them to try again at a write that will be
 * refused every time.
 */

const RAISED = {
  cycle:
    'unexpected error: AUTOPILOT_NEEDS_SUPERVISED_CYCLE (raise_exception) in function loop_channel_autonomy_l3_guard',
  brain: 'AUTOPILOT_NEEDS_BRAIN',
  unconfirmed:
    'AUTOPILOT_BRAIN_UNCONFIRMED: hook.core_promise, customer_persona.primary_pain_point',
}

describe('a workspace that has never run a supervised week', () => {
  const m = autopilotRefusalMessage(RAISED.cycle)!

  it('says a week has to run first, which is the thing that is missing', () => {
    expect(m).not.toBeNull()
    expect(m.toLowerCase()).toContain('week')
  })

  it('never tells them to try again, because it would be refused every time', () => {
    expect(m.toLowerCase()).not.toContain('try again')
  })
})

describe('a workspace with no Brand Brain', () => {
  const m = autopilotRefusalMessage(RAISED.brain)!

  it('names the Brain as the thing to resolve', () => {
    expect(m.toLowerCase()).toContain('brand brain')
  })

  it('is a different sentence from the supervised-cycle one', () => {
    // Two different missing things with two different remedies. Collapsing them
    // would send somebody to run a week when their Brain is the problem.
    expect(m).not.toBe(autopilotRefusalMessage(RAISED.cycle))
  })
})

describe('a Brain whose four fields are not confirmed', () => {
  const m = autopilotRefusalMessage(RAISED.unconfirmed)!

  it('says what to confirm, in the customer’s words', () => {
    const lower = m.toLowerCase()
    expect(lower).toContain('promise')
    expect(lower).toContain('red lines')
  })

  it('never prints the internal field paths Postgres appended', () => {
    // The exception carries `hook.core_promise` and friends. Those are database
    // keys, and showing them is the implementation jargon the copy rules exist
    // to keep out of a shop owner's screen.
    expect(m).not.toContain('hook.core_promise')
    expect(m).not.toContain('customer_persona')
    expect(m).not.toContain('_')
  })
})

describe('anything else', () => {
  it('is not claimed as an autopilot refusal', () => {
    // The caller falls back to its own sentence. Guessing here would put an
    // autopilot explanation over a connection error.
    expect(autopilotRefusalMessage('duplicate key value violates unique constraint')).toBeNull()
    expect(autopilotRefusalMessage('')).toBeNull()
  })

  it('does not match on a fragment that merely mentions autopilot', () => {
    expect(autopilotRefusalMessage('autopilot')).toBeNull()
  })
})

describe('what none of the three may do', () => {
  const all = [RAISED.cycle, RAISED.brain, RAISED.unconfirmed].map((r) =>
    autopilotRefusalMessage(r)!,
  )

  it('never claims autopilot is unbuilt, which stopped being true', () => {
    // The old copy said "Autopilot is not built yet". It is built; what is
    // missing is this workspace's own preconditions, and saying otherwise sends
    // somebody away from a setting they could earn.
    for (const m of all) expect(m.toLowerCase()).not.toContain('not built')
  })

  it('gives every refusal something to do, never a bare no', () => {
    for (const m of all) expect(m.trim().length).toBeGreaterThan(20)
  })

  it('answers all three distinctly, so the reader learns which one they hit', () => {
    expect(new Set(all).size).toBe(3)
  })
})
