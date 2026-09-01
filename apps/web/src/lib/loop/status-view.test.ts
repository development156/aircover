import { describe, expect, it } from 'vitest'

import { loopState, loopStatusView } from './status-view'

/**
 * The state this file exists for is the FIRST one: a workspace that has never
 * turned the Loop on. It reads `enabled: false, paused: false`, which is the
 * same pair as a live idle Loop, and per `read.ts` it is 28 of 33 production
 * workspaces. Every assertion below was red before `status-view.ts` existed.
 */

const WAITING = 'waiting for Sunday'

const NEVER_ON = { enabled: false, paused: false, running: false }
const PAUSED = { enabled: true, paused: true, running: false }
const RUNNING = { enabled: true, paused: false, running: true }
const IDLE = { enabled: true, paused: false, running: false }

describe('a Loop nobody turned on is not a running Loop', () => {
  it('is off, not waiting', () => {
    expect(loopState(NEVER_ON)).toBe('off')
    expect(loopState(IDLE)).toBe('waiting')
  })

  it('offers to turn the Loop ON, never to pause it', () => {
    // The defect this replaces: the button read `paused` alone, so a workspace
    // that had never run the Loop was offered "Pause the Loop" — and
    // `eligibility.ts` sends people here under a link labelled "Turn the Loop
    // on".
    expect(loopStatusView(NEVER_ON, WAITING).intent).toBe('turn-on')
    expect(loopStatusView(PAUSED, WAITING).intent).toBe('turn-on')
    expect(loopStatusView(IDLE, WAITING).intent).toBe('pause')
    expect(loopStatusView(RUNNING, WAITING).intent).toBe('pause')
  })

  it('never wears the chrome that means running', () => {
    // `tone`/`ground` ignored `enabled` entirely, so "Not turned on" was painted
    // in the same green `ok` as "On, waiting for Sunday".
    const off = loopStatusView(NEVER_ON, WAITING)
    const idle = loopStatusView(IDLE, WAITING)

    expect(idle.ground).toContain('ok')
    expect(off.ground).not.toContain('ok')
    expect(off.tone).not.toContain('ok')
    expect(off.text).toBe('text-muted')
  })

  it('says so in words, because colour is not a sentence', () => {
    expect(loopStatusView(NEVER_ON, WAITING).label).toBe('Not turned on')
    expect(loopStatusView(PAUSED, WAITING).label).toBe('Paused')
    expect(loopStatusView(RUNNING, WAITING).label).toBe('Running now')
    expect(loopStatusView(IDLE, WAITING).label).toBe(`On, ${WAITING}`)
  })
})

describe('the label and the chrome cannot disagree', () => {
  /**
   * The whole reason this is one function. Three separate expressions over the
   * same three booleans is what let the label say "Not turned on" while the
   * colours said running.
   */
  it('gives every state one reading, and quiet states recede together', () => {
    for (const facts of [NEVER_ON, PAUSED]) {
      const view = loopStatusView(facts, WAITING)
      expect(view.intent).toBe('turn-on')
      expect(view.text).toBe('text-muted')
      expect(view.ground).toBe('bg-s2')
    }
    for (const facts of [IDLE, RUNNING]) {
      const view = loopStatusView(facts, WAITING)
      expect(view.intent).toBe('pause')
      expect(view.text).toBe('text-ink')
    }
  })
})
