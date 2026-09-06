import { describe, expect, test } from 'vitest'

import { setupLadder, type SetupSignals } from './setup'

/**
 * ONE ABSENCE, ONE STATEMENT (docs/37 §15). MEASURED 2026-09-06 on the full
 * dashboard of a workspace with one draft and nothing else: the Performance
 * card said "Connect a channel to start measuring", the Connections card said
 * "Not connected" four times and then "You can write and plan without one",
 * the Brand Brain card said "Sahoda doesn't know your brand yet", and the
 * topbar ring said "No brain yet". Four containers, two absences, six
 * statements. The ladder says each absence once, at the top, with its door.
 */
const ALL: SetupSignals = { hasBrain: true, connections: 2, posts: 3 }

describe('setupLadder', () => {
  test('a finished workspace has nothing to show', () => {
    const ladder = setupLadder(ALL)
    expect(ladder.remaining).toBe(0)
    expect(ladder.next).toBeNull()
    expect(ladder.steps.every((s) => s.done)).toBe(true)
  })

  test('the first undone step, in the order that unblocks the most, is the next door', () => {
    const ladder = setupLadder({ hasBrain: false, connections: 0, posts: 1 })
    expect(ladder.remaining).toBe(2)
    expect(ladder.next?.id).toBe('brain')
    expect(ladder.next?.href).toBe('/onboarding')
  })

  test('a channel is the next door once the brain exists', () => {
    const ladder = setupLadder({ hasBrain: true, connections: 0, posts: 1 })
    expect(ladder.remaining).toBe(1)
    expect(ladder.next?.id).toBe('connect')
    expect(ladder.next?.href).toBe('/connections')
  })

  test('an unreadable signal is never shown as undone', () => {
    // A failed read is not a missing brain. Showing "Teach Sahoda your brand"
    // to a workspace whose brain simply did not load is the same defect as
    // the first-run screen replacing a founder's dashboard.
    const ladder = setupLadder({ hasBrain: null, connections: null, posts: 0 })
    expect(ladder.steps.find((s) => s.id === 'brain')?.done).toBe(true)
    expect(ladder.steps.find((s) => s.id === 'connect')?.done).toBe(true)
    expect(ladder.next?.id).toBe('write')
  })

  test('every step names what it unlocks, in the reader’s terms', () => {
    for (const step of setupLadder(ALL).steps) {
      expect(step.label.length).toBeGreaterThan(0)
      expect(step.href).toMatch(/^\/(onboarding|connections|posts\/new)$/)
    }
  })
})
