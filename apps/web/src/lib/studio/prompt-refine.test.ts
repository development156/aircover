import { describe, expect, test } from 'vitest'
import { DEMO_FALLBACK_PAYLOAD, type BrandMemoryPayload } from '@sahoda/shared'

import type { BrainRead } from '@/lib/brand/read-brain'

import { describeRefineContext, refineContextFromBrainRead } from './prompt-refine'

/**
 * THE THREE STATES, KEPT APART, AND WHAT EACH ONE MAY CLAIM.
 *
 * Every test here asserts a CLAIM (brainState, which signals ride along, what
 * the copy says), never exact wording — the same discipline `prompt.test.ts`
 * uses for `conditionPrompt`.
 */

const BRAIN: BrandMemoryPayload = {
  ...DEMO_FALLBACK_PAYLOAD,
  voice: { ...DEMO_FALLBACK_PAYLOAD.voice, descriptor: 'Dry and understated' },
}

function okRead(): BrainRead {
  return {
    status: 'ok',
    active: BRAIN,
    version: 3,
    provenance: new Map([['voice.descriptor', 'confirmed']]),
    meta: undefined,
    intake: undefined,
    source: 'manual',
    appliedFromLearning: false,
  }
}

describe('refineContextFromBrainRead', () => {
  test('a read brain yields brainState ok and its visual signals', () => {
    const ctx = refineContextFromBrainRead(okRead())
    expect(ctx.brainState).toBe('ok')
    expect(ctx.signals.some((s) => s.value === 'Dry and understated')).toBe(true)
  })

  test('a confirmed field in provenance carries confirmed, everything else guessed', () => {
    const ctx = refineContextFromBrainRead(okRead())
    const voice = ctx.signals.find((s) => s.field === 'voice')
    expect(voice?.certainty).toBe('confirmed')
    const character = ctx.signals.find((s) => s.field === 'character')
    expect(character?.certainty).toBe('guessed')
  })

  /** THE ONE THIS FEATURE EXISTS FOR: these two must never collapse into one. */
  test('no-brain and unreadable are DIFFERENT brainStates, both with zero signals', () => {
    const empty = refineContextFromBrainRead({ status: 'no-brain' })
    const unreadable = refineContextFromBrainRead({ status: 'unreadable' })

    expect(empty.brainState).toBe('empty')
    expect(unreadable.brainState).toBe('unreadable')
    expect(empty.brainState).not.toBe(unreadable.brainState)
    expect(empty.signals).toEqual([])
    expect(unreadable.signals).toEqual([])
  })

  test('no-workspace reads as unreadable, because a caller here already knows a workspace exists', () => {
    expect(refineContextFromBrainRead({ status: 'no-workspace' }).brainState).toBe('unreadable')
  })

  test('a palette signal rides along only when a theme is given', () => {
    const withTheme = refineContextFromBrainRead(okRead(), { primary: 'brand-primary' })
    const withoutTheme = refineContextFromBrainRead(okRead(), null)
    expect(withTheme.signals.some((s) => s.field === 'colours')).toBe(true)
    expect(withoutTheme.signals.some((s) => s.field === 'colours')).toBe(false)
  })
})

describe('describeRefineContext', () => {
  /** Different claims, different sentences — and the two "nothing" states must read differently. */
  test('empty and unreadable produce different copy', () => {
    const empty = describeRefineContext({ brainState: 'empty', signals: [] })
    const unreadable = describeRefineContext({ brainState: 'unreadable', signals: [] })

    expect(empty.headline).not.toBe(unreadable.headline)
    expect(empty.body).not.toBe(unreadable.body)
    // Each claim is about the RIGHT thing: unreadable talks about a failed
    // read; empty never claims a read failed.
    expect(unreadable.headline.toLowerCase()).toContain('could not read')
    expect(empty.headline.toLowerCase()).not.toContain('could not read')
  })

  test('a brain that read ok but had nothing usable is its own third sentence', () => {
    const nothingUsable = describeRefineContext({ brainState: 'ok', signals: [] })
    const empty = describeRefineContext({ brainState: 'empty', signals: [] })
    expect(nothingUsable.headline).not.toBe(empty.headline)
  })

  test('confirmed and guessed counts are both named when both are present', () => {
    const { headline } = describeRefineContext({
      brainState: 'ok',
      signals: [
        { field: 'voice', certainty: 'confirmed', value: 'x' },
        { field: 'character', certainty: 'guessed', value: 'y' },
      ],
    })
    expect(headline).toContain('1 confirmed')
    expect(headline).toContain('1 guessed')
  })
})
