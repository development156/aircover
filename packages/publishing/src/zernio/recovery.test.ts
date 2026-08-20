import { describe, it, expect } from 'vitest'
import { CONSTRAINTS, type Channel } from '@sahoda/shared'

import { ZERNIO_PLATFORM_NAME } from '../adapters/zernio'
import { canRecover, recoveryPlatform, recoveryUnavailableReason } from './recovery'

const CHANNELS = Object.keys(CONSTRAINTS) as Channel[]

/**
 * Every expectation here was read out of Zernio's OWN 400 responses on
 * 2026-08-20, by calling each endpoint with an ObjectId that cannot exist so no
 * real post could be reached. None of it is guessable and none of it agrees with
 * the publish endpoint.
 */
describe('the platform vocabularies, which are three and not one', () => {
  it('edit accepts only X, and spells it twitter', () => {
    // *"expected one of \"twitter\"|\"discord\"|\"facebook\"|\"reddit\""* — the
    // endpoint's whole enum, in its own words. LinkedIn, Instagram and Google
    // Business are in none of it.
    expect(recoveryPlatform('x', 'edit')).toBe('twitter')
    expect(recoveryPlatform('linkedin', 'edit')).toBeNull()
    expect(recoveryPlatform('gbp', 'edit')).toBeNull()
    expect(recoveryPlatform('instagram', 'edit')).toBeNull()
  })

  it('unpublish accepts three of four, and Instagram is the one it does not', () => {
    expect(recoveryPlatform('x', 'unpublish')).toBe('twitter')
    expect(recoveryPlatform('linkedin', 'unpublish')).toBe('linkedin')
    expect(recoveryPlatform('gbp', 'unpublish')).toBe('googlebusiness')
    expect(recoveryPlatform('instagram', 'unpublish')).toBeNull()
  })

  /**
   * ── THE TRAP, AS AN ASSERTION ─────────────────────────────────────────────
   * `ZERNIO_PLATFORM_NAME` is the publish vocabulary and reusing it here is the
   * obvious tidy-up. It maps gbp → 'google', which unpublish refuses BY NAME
   * ("Invalid platform. Supported platforms: … googlebusiness …"), and x → 'x',
   * which edit refuses. This asserts they DISAGREE, so a future refactor that
   * collapses them into one map goes red here instead of silently breaking
   * recovery for Google.
   */
  it('is deliberately NOT the publish vocabulary', () => {
    expect(ZERNIO_PLATFORM_NAME.gbp).toBe('google')
    expect(recoveryPlatform('gbp', 'unpublish')).not.toBe(ZERNIO_PLATFORM_NAME.gbp)

    expect(ZERNIO_PLATFORM_NAME.x).toBe('x')
    expect(recoveryPlatform('x', 'edit')).not.toBe(ZERNIO_PLATFORM_NAME.x)
    expect(recoveryPlatform('x', 'unpublish')).not.toBe(ZERNIO_PLATFORM_NAME.x)
  })

  it('retry is post-level and needs no platform on any channel', () => {
    for (const channel of CHANNELS) {
      expect(recoveryPlatform(channel, 'retry')).toBe('')
      expect(canRecover(channel, 'retry')).toBe(true)
    }
  })
})

describe('what a writer is told about an action that does not exist', () => {
  it('names the channel and where to go instead, for every unsupported pair', () => {
    for (const channel of CHANNELS) {
      for (const action of ['edit', 'unpublish'] as const) {
        const reason = recoveryUnavailableReason(channel, action)
        if (canRecover(channel, action)) {
          expect(reason).toBeNull()
          continue
        }
        expect(reason).not.toBeNull()
        // Not a shrug. It says what to do instead, which is the difference
        // between a limit and a dead end.
        expect(reason).toMatch(/open /i)
        // And it never leaks the channel enum or a vendor the reader has no
        // relationship with.
        expect(reason).not.toMatch(/zernio/i)
        expect(reason).not.toMatch(/\bgbp\b/)
      }
    }
  })

  it('says nothing where the action works', () => {
    expect(recoveryUnavailableReason('x', 'edit')).toBeNull()
    expect(recoveryUnavailableReason('linkedin', 'unpublish')).toBeNull()
    expect(recoveryUnavailableReason('gbp', 'unpublish')).toBeNull()
  })

  /**
   * Exactly one of this product's four channels can have a live post edited.
   * Pinned as a NUMBER so that a channel quietly gaining or losing the capability
   * shows up as a failing count rather than as nobody noticing.
   */
  it('counts what is actually possible today', () => {
    expect(CHANNELS.filter((c) => canRecover(c, 'edit'))).toEqual(['x'])
    expect(CHANNELS.filter((c) => canRecover(c, 'unpublish')).sort()).toEqual([
      'gbp',
      'linkedin',
      'x',
    ])
  })
})
