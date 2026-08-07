import { PostStatusSchema, type PostStatus } from '@sahoda/shared'
import { describe, expect, test } from 'vitest'

import { certaintyFor, type Certainty, type PostPublishMode } from './certainty'

/**
 * The Certainty System mapping (UI_RULES_v3).
 *
 * The rule this file exists to enforce is the honesty rule: a chip may never
 * claim more than the data proves. `.is-real` means "it happened", and the only
 * evidence for that is a SUCCEEDED publish log with `mode = 'live'`. Everything
 * else — a missing log, a failed read, a fixture run, a mix of the two — must
 * fall back to a weaker claim.
 *
 * `mode` is not on `post_variants`; it lives on `post_publish_logs`, which is a
 * separate read that can fail. So "we don't know" is a first-class input here,
 * not an edge case, and it must never resolve to `.is-real`.
 */

const ALL_STATUSES = PostStatusSchema.options
const ALL_MODES: PostPublishMode[] = ['live', 'fixture', 'mixed', null]

describe('certaintyFor — the specified mapping', () => {
  test('published + live is the ONLY route to .is-real', () => {
    const real: Array<[PostStatus, PostPublishMode]> = []
    for (const status of ALL_STATUSES) {
      for (const mode of ALL_MODES) {
        if (certaintyFor(status, mode).level === 'real') real.push([status, mode])
      }
    }

    expect(real).toEqual([['published', 'live']])
  })

  test('published + fixture is simulated and carries a required label', () => {
    const result = certaintyFor('published', 'fixture')

    expect(result.level).toBe('simulated')
    // The hatch alone is not a claim — UI_RULES_v3 requires a visible text label
    // on every simulated element, so the mapping hands one to the component
    // rather than leaving it to each call site to remember.
    expect(result.label).toBeTruthy()
    expect(result.label?.toLowerCase()).toContain('simulated')
  })

  test('approved is committed', () => {
    expect(certaintyFor('approved', null).level).toBe('committed')
  })

  test('idea and draft are proposed', () => {
    expect(certaintyFor('idea', null).level).toBe('proposed')
    expect(certaintyFor('draft', null).level).toBe('proposed')
  })

  test('failed is a danger stroke, not a certainty level', () => {
    const result = certaintyFor('failed', null)

    expect(result.level).toBe('failed')
    // It must not borrow any of the four certainty treatments — a failure is not
    // a degree of realness, it is a different axis entirely.
    expect(['real', 'committed', 'proposed', 'simulated']).not.toContain(result.level)
  })
})

describe('certaintyFor — the weaker claim under uncertainty', () => {
  test('published with an UNKNOWN mode never claims real', () => {
    // The publish-log read failed, timed out, or returned nothing. A missing log
    // is not evidence of a live publish.
    const result = certaintyFor('published', null)

    expect(result.level).not.toBe('real')
    expect(result.level).toBe('committed')
  })

  test('published with an unknown mode does not claim SIMULATED either', () => {
    // Simulated is not the weaker claim, it is a DIFFERENT claim: it asserts the
    // publish was not real. Asserting that on missing data would be its own lie.
    expect(certaintyFor('published', null).level).not.toBe('simulated')
  })

  test('published with MIXED modes falls back rather than picking a side', () => {
    // One channel live, another fixture. `.is-real` would outrun the fixture
    // channel; `.is-simulated` would erase the live one. Neither is honest at
    // post level, so the summary under-claims and lets the rows speak.
    const result = certaintyFor('published', 'mixed')

    expect(result.level).toBe('committed')
    expect(result.level).not.toBe('real')
  })

  test('a live mode on a NON-published status cannot promote it to real', () => {
    // Defence against a stray log attached to a post that was later reset: the
    // status is the gate, the mode only refines it.
    for (const status of ALL_STATUSES) {
      if (status === 'published') continue
      expect(certaintyFor(status, 'live').level, status).not.toBe('real')
    }
  })
})

describe('certaintyFor — total over the enum', () => {
  test('every status × every mode returns a level, none throw', () => {
    for (const status of ALL_STATUSES) {
      for (const mode of ALL_MODES) {
        const result = certaintyFor(status, mode)
        expect(result.level, `${status}/${mode}`).toBeTruthy()
      }
    }
  })

  test('the statuses with no UI built resolve to a neutral level, not a wrong one', () => {
    // review / scheduled / publishing / expired are never written by any code
    // path today (proven in schedule-status-reachability.test.ts and the Phase A
    // audit). They stay mapped so the enum stays exhaustive, but they must not
    // borrow a certainty treatment they have not earned.
    for (const status of ['review', 'scheduled', 'publishing', 'expired'] as const) {
      const level: Certainty['level'] = certaintyFor(status, null).level
      expect(['neutral', 'committed', 'proposed'], status).toContain(level)
    }
    expect(certaintyFor('expired', null).level).toBe('neutral')
  })

  test('only simulated carries a label', () => {
    for (const status of ALL_STATUSES) {
      for (const mode of ALL_MODES) {
        const result = certaintyFor(status, mode)
        if (result.level !== 'simulated') expect(result.label, `${status}/${mode}`).toBeNull()
      }
    }
  })
})
