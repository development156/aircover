import { describe, expect, it } from 'vitest'

import { AUTONOMY_LEVELS, AutonomyLevelSchema, DEFAULT_AUTONOMY_LEVEL } from './loop'

/**
 * THE CONTRACT CHANGE THAT LETS A CUSTOMER ARM A CHANNEL.
 *
 * `AutonomyLevelSchema` accepted 0, 1 and 2 for as long as autopilot did not
 * exist, and its header argued the case: a schema that admitted a 3 would let
 * the value reach a column that refused it and come back as a raw constraint
 * violation. That argument was right, and the answer was never to keep the
 * union closed forever — it was to open it only once the refusals on the other
 * side had sentences. They do now, in `loop-dial.refusals.test.ts`.
 *
 * What this file pins is the pair of facts that make the change safe rather
 * than merely possible: the union admits 3 and nothing else, and the DEFAULT
 * did not move. A widened union that also moved the default would arm every
 * workspace by upgrade, which is the one mistake in this area that cannot be
 * undone by a later deploy.
 */

describe('the storable levels', () => {
  it('admits 3, so a customer can choose autopilot', () => {
    expect(AutonomyLevelSchema.safeParse(3).success).toBe(true)
  })

  it('still admits the three that came before it', () => {
    for (const level of [0, 1, 2]) {
      expect(AutonomyLevelSchema.safeParse(level).success).toBe(true)
    }
  })

  it('admits nothing above 3, so a fourth rung cannot arrive by accident', () => {
    for (const level of [4, 5, 99, -1]) {
      expect(AutonomyLevelSchema.safeParse(level).success).toBe(false)
    }
  })

  it('admits no near-miss shapes, which a looser schema would let through', () => {
    for (const value of ['3', 3.5, null, undefined, true, [3]]) {
      expect(AutonomyLevelSchema.safeParse(value).success).toBe(false)
    }
  })
})

describe('the default did not move', () => {
  it('is still L1, so nothing is armed by upgrading', () => {
    // The one mistake here that a later deploy cannot undo: posts that went out
    // unattended because a default changed under people.
    expect(DEFAULT_AUTONOMY_LEVEL).toBe(1)
  })
})

describe('the ladder a customer reads', () => {
  const l3 = AUTONOMY_LEVELS.find((l) => l.level === 3)!

  it('offers L3 as a control now, not as a description', () => {
    // `storable` is the difference between a control and a paragraph. The Loop
    // screen branches on it.
    expect(l3.storable).toBe(true)
  })

  it('no longer claims autopilot is unbuilt, which stopped being true', () => {
    expect(l3.needs.toLowerCase()).not.toContain('not built')
  })

  it('names the preconditions the database actually enforces', () => {
    // The trigger checks a reported cycle and four confirmed Brain fields. The
    // ladder must describe the same two things, or a reader meets a refusal the
    // screen never warned them about.
    const needs = l3.needs.toLowerCase()
    expect(needs).toContain('week')
    expect(needs).toContain('brand brain')
  })

  it('says the post can still be stopped, because that is the promise', () => {
    expect(l3.may.toLowerCase()).toContain('stop')
  })

  it('keeps every level describable, so the ladder has no gap', () => {
    expect(AUTONOMY_LEVELS.map((l) => l.level)).toEqual([0, 1, 2, 3])
    for (const level of AUTONOMY_LEVELS) {
      expect(level.may.trim().length).toBeGreaterThan(0)
      expect(level.needs.trim().length).toBeGreaterThan(0)
    }
  })
})
