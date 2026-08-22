import { beforeEach, describe, expect, test, vi } from 'vitest'

import { clearIntakeStash, readIntakeStash, stashIntake } from './intake-recovery'

/**
 * The buffer, and the two things it must refuse to do.
 *
 * A .tsx file with no JSX in it: vitest.config.ts routes .test.ts to the `lib`
 * project, which is a NODE environment with no sessionStorage at all. A buffer
 * test there does not fail honestly — it fails with ReferenceError before it
 * reaches an assertion.
 *
 * The flow's own wiring — that it WRITES on every change and READS on mount —
 * is pinned separately in `intake-recovery-wired.test.ts`, because a correct
 * buffer nobody calls is exactly the failure `intake-persisted.test.ts` was
 * written to catch one flow over.
 */

beforeEach(() => {
  sessionStorage.clear()
})

describe('what was typed comes back', () => {
  test('a stash round-trips text, step and the hand-picked overrides', () => {
    stashIntake({
      screen: 'question',
      text: 'We roast filter coffee in Jayanagar and deliver by cycle.',
      overrides: { model: 'local_presence' },
    })

    expect(readIntakeStash()).toEqual({
      screen: 'question',
      text: 'We roast filter coffee in Jayanagar and deliver by cycle.',
      overrides: { model: 'local_presence' },
    })
  })

  test('nothing typed writes nothing, so a re-mount cannot erase a real stash', () => {
    stashIntake({ screen: 'intake', text: 'A real sentence', overrides: {} })
    // The flow re-renders at its defaults for a moment on any remount; if that
    // render wrote an empty stash it would destroy the thing being recovered.
    stashIntake({ screen: 'intake', text: '   ', overrides: {} })

    expect(readIntakeStash()?.text).toBe('A real sentence')
  })

  test('a resolve clears it, because the brain is the record from then on', () => {
    stashIntake({ screen: 'question', text: 'Something', overrides: {} })
    clearIntakeStash()

    expect(readIntakeStash()).toBeNull()
  })
})

describe('what comes out of storage is not trusted', () => {
  test.each([
    ['not json at all', '{oh no'],
    ['a bare string', '"hello"'],
    ['null', 'null'],
    ['an array', '[]'],
    ['no text field', '{"screen":"intake","overrides":{}}'],
    ['a numeric text field', '{"screen":"intake","text":5,"overrides":{}}'],
    ['overrides as an array', '{"screen":"intake","text":"x","overrides":[]}'],
  ])('%s reads as nothing rather than reaching the resolve', (_name, raw) => {
    sessionStorage.setItem('sahoda.onboarding.intake', raw)

    // Anything on the origin can write this key, and a malformed object here
    // would be handed to a 50-credit action.
    expect(readIntakeStash()).toBeNull()
  })

  test('a runaway paste is not stored, rather than filling the quota', () => {
    stashIntake({ screen: 'intake', text: 'x'.repeat(50_000), overrides: {} })

    expect(readIntakeStash()).toBeNull()
  })
})

describe('storage being unavailable never takes onboarding down', () => {
  test('a throwing sessionStorage is survived on every call', () => {
    const boom = (): never => {
      throw new Error('storage is blocked in this context')
    }
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(boom)
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(boom)
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(boom)

    // Safari private mode, a partitioned frame, a browser set to block site
    // data. A recovery buffer that can crash the flow is worse than none.
    expect(() => stashIntake({ screen: 'intake', text: 'x', overrides: {} })).not.toThrow()
    expect(readIntakeStash()).toBeNull()
    expect(() => clearIntakeStash()).not.toThrow()

    vi.restoreAllMocks()
  })
})
