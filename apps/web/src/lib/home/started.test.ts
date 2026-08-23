import { describe, expect, test } from 'vitest'

import { startSteps, workspaceHasStarted, type StartedSignals } from './started'

const NOTHING: StartedSignals = {
  posts: 0,
  connections: 0,
  hasBrain: false,
  spendRows: 0,
  accountReported: false,
}

describe('a workspace with nothing in it has not started', () => {
  test('all five signals empty', () => {
    expect(workspaceHasStarted(NOTHING)).toBe(false)
  })

  test.each([
    ['a post', { posts: 1 }],
    ['a connection', { connections: 1 }],
    ['a Brand Brain', { hasBrain: true }],
    ['spend', { spendRows: 1 }],
    ['an account figure', { accountReported: true }],
  ] as const)('%s is enough on its own', (_what, patch) => {
    expect(workspaceHasStarted({ ...NOTHING, ...patch })).toBe(true)
  })
})

/**
 * The direction that matters. Replacing a customer's dashboard with a setup
 * screen on the strength of a query that FAILED tells them their work is gone;
 * the cost of the opposite error is one scroll past some empty cards. Every
 * unknown therefore resolves to "started".
 */
describe('an unknown is never read as an absence', () => {
  test.each([
    ['connections', { connections: null }],
    ['the Brand Brain', { hasBrain: null }],
    ['spend', { spendRows: null }],
  ] as const)('an unreadable %s counts as started', (_what, patch) => {
    expect(workspaceHasStarted({ ...NOTHING, ...patch })).toBe(true)
  })

  /**
   * And a real ZERO is not an unknown. `null` and `0` arriving at the same
   * conclusion would make the distinction above decorative — this is the
   * assertion that proves the two are actually being told apart.
   */
  test('a real zero is knowledge, and does NOT count as started', () => {
    expect(workspaceHasStarted({ ...NOTHING, connections: 0, spendRows: 0 })).toBe(false)
  })
})

describe('the three doors', () => {
  test('all three render whatever their state, so the list can teach', () => {
    expect(startSteps(NOTHING).map((s) => s.id)).toEqual(['brain', 'connect', 'write'])
    expect(startSteps({ ...NOTHING, hasBrain: true, connections: 2, posts: 5 }).length).toBe(3)
  })

  test('done tracks the real signal, not the position in the list', () => {
    const steps = startSteps({ ...NOTHING, posts: 3 })
    expect(steps.find((s) => s.id === 'write')?.done).toBe(true)
    expect(steps.find((s) => s.id === 'brain')?.done).toBe(false)
  })

  /**
   * An unreadable connections read must not be drawn as a tick. `?? 0` is what
   * does it, and this is the test that keeps it there.
   */
  test('an unreadable connections read is not a completed step', () => {
    expect(
      startSteps({ ...NOTHING, connections: null }).find((s) => s.id === 'connect')?.done,
    ).toBe(false)
  })

  test('every step points somewhere that works with no setup at all', () => {
    // No step may be gated on another: writing genuinely works with no brain and
    // no connection, so a locked third row would be a false claim dressed as help.
    for (const step of startSteps(NOTHING)) {
      expect(step.href).toMatch(/^\/(brain|connections|posts\/new)$/)
    }
  })
})
