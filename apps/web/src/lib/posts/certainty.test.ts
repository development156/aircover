import { PostStatusSchema, type PostStatus } from '@sahoda/shared'
import { describe, expect, test } from 'vitest'

import { certaintyFor, type Certainty } from './certainty'
import type { PostOutcome } from './publish-evidence'

/**
 * The Certainty System mapping (UI_RULES_v3).
 *
 * The rule this file enforces is the honesty rule: a chip may never claim more
 * than the data proves. `.is-real` means "it happened", and the only evidence
 * for that is a post whose every channel is live on a real platform.
 *
 * ── WHAT CHANGED, AND THE DEFECT IT CLOSES ───────────────────────────────────
 * This mapping used to gate `real` on `intent === 'published'` and refine it
 * with `post_publish_logs.mode`. Both inputs were wrong for the paths that
 * actually run: nothing writes `published` on the manual publish route, and the
 * dispatcher's settle write is behind a flag that defaults off — so a post live
 * on every channel sat at `approved` and rendered `committed`. The mode read was
 * a SECOND derivation of "simulated" off a different table, which is how two
 * sources for one fact drift.
 *
 * So the evidence is now the outcome, and intent may only ever decide what the
 * evidence declines to.
 */

const ALL_STATUSES = PostStatusSchema.options
const ALL_OUTCOMES: PostOutcome[] = ['unknown', 'none', 'live', 'partial', 'simulated', 'failed']

describe('certaintyFor — evidence decides realness', () => {
  test('outcome `live` is the ONLY route to .is-real, from ANY intent', () => {
    const real: Array<[PostStatus, PostOutcome]> = []
    for (const intent of ALL_STATUSES) {
      for (const outcome of ALL_OUTCOMES) {
        if (certaintyFor(intent, outcome).level === 'real') real.push([intent, outcome])
      }
    }

    expect(real.map(([, outcome]) => outcome)).toEqual(ALL_STATUSES.map(() => 'live'))
    expect(real).toHaveLength(ALL_STATUSES.length)
  })

  test('THE DEFECT: an `approved` post that went out live renders real', () => {
    // The publish path writes `post_variants` and never the post row, so this is
    // the ORDINARY shape of a published post in this product — not an edge case.
    // Before the evidence moved, this rendered `committed`: a post that is live
    // on every channel, drawn as though nobody had sent it.
    expect(certaintyFor('approved', 'live').level).toBe('real')
    expect(certaintyFor('scheduled', 'live').level).toBe('real')
    expect(certaintyFor('draft', 'live').level).toBe('real')
  })

  test('outcome `simulated` is simulated and carries a required label', () => {
    const result = certaintyFor('approved', 'simulated')

    expect(result.level).toBe('simulated')
    // The hatch alone is not a claim — UI_RULES_v3 requires visible text on every
    // simulated element, handed down by the mapping so no call site can forget it.
    expect(result.label).toBeTruthy()
    expect(result.label?.toLowerCase()).toContain('simulated')
  })

  test('outcome `partial` under-claims rather than picking a side', () => {
    // `.is-real` would claim the whole post is out; `failed` would deny the
    // channel that is. The per-channel breakdown is where realness belongs.
    const result = certaintyFor('approved', 'partial')

    expect(result.level).toBe('committed')
    expect(result.level).not.toBe('real')
  })

  test('outcome `failed` is a danger stroke, not a certainty level', () => {
    const result = certaintyFor('approved', 'failed')

    expect(result.level).toBe('failed')
    expect(['real', 'committed', 'proposed', 'simulated']).not.toContain(result.level)
  })
})

describe('certaintyFor — the weaker claim under uncertainty', () => {
  test('UNKNOWN evidence never claims real, whatever the intent says', () => {
    // The variant read failed, timed out, or returned nothing. Absence is not
    // evidence — in either direction.
    for (const intent of ALL_STATUSES) {
      expect(certaintyFor(intent, 'unknown').level, intent).not.toBe('real')
    }
  })

  test('an intent of `published` with no evidence under-claims rather than asserting', () => {
    // The dispatcher settled the post but the rows have not (yet) borne it out.
    expect(certaintyFor('published', 'unknown').level).toBe('committed')
    expect(certaintyFor('published', 'none').level).toBe('committed')
  })

  test('unknown evidence does not claim SIMULATED either', () => {
    // Simulated is not the weaker claim, it is a DIFFERENT one: it asserts the
    // publish was not real. Asserting that on missing data is its own lie.
    for (const intent of ALL_STATUSES) {
      expect(certaintyFor(intent, 'unknown').level, intent).not.toBe('simulated')
    }
  })

  test('intent alone can never reach real — approving a post is not publishing it', () => {
    for (const intent of ALL_STATUSES) {
      for (const outcome of ['unknown', 'none'] as const) {
        expect(certaintyFor(intent, outcome).level, `${intent}/${outcome}`).not.toBe('real')
      }
    }
  })

  test('with no evidence, intent decides exactly as it always did', () => {
    expect(certaintyFor('approved', 'unknown').level).toBe('committed')
    expect(certaintyFor('idea', 'unknown').level).toBe('proposed')
    expect(certaintyFor('draft', 'unknown').level).toBe('proposed')
    expect(certaintyFor('failed', 'unknown').level).toBe('failed')
    expect(certaintyFor('expired', 'unknown').level).toBe('neutral')
    expect(certaintyFor('review', 'unknown').level).toBe('neutral')
  })
})

describe('certaintyFor — total over both enums', () => {
  test('every intent × every outcome returns a level, none throw', () => {
    for (const intent of ALL_STATUSES) {
      for (const outcome of ALL_OUTCOMES) {
        const result = certaintyFor(intent, outcome)
        expect(result.level, `${intent}/${outcome}`).toBeTruthy()
      }
    }
  })

  test('the statuses with no UI built stay mapped and claim nothing', () => {
    for (const intent of ['review', 'expired'] as const) {
      const level: Certainty['level'] = certaintyFor(intent, 'unknown').level
      expect(level, intent).toBe('neutral')
    }
  })

  test('only simulated carries a label', () => {
    for (const intent of ALL_STATUSES) {
      for (const outcome of ALL_OUTCOMES) {
        const result = certaintyFor(intent, outcome)
        if (result.level !== 'simulated') expect(result.label, `${intent}/${outcome}`).toBeNull()
      }
    }
  })
})
