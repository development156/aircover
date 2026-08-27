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
  /**
   * ── A TRUNCATED ERROR MESSAGE READ AS A COMPLETE ENUM ──────────────────────
   * This test used to be called "edit accepts only X, and spells it twitter" and
   * asserted `linkedin` and `gbp` were null. Its evidence was a real 400 from
   * 2026-08-20, quoted in the comment:
   *
   *   expected one of "twitter"|"discord"|"facebook"|"reddit"
   *
   * The error was CUT OFF after four values. The spec's actual enum is
   * [twitter, discord, facebook, reddit, linkedin, telegram, pinterest,
   * googlebusiness, youtube, slack] — and the first four are exactly the four
   * that were seen. So the observation was real, correctly recorded, and led to
   * a conclusion about ABSENCE that a truncated list cannot support.
   *
   * The lesson is narrow and worth keeping: an enum read out of an error string
   * proves what IS accepted, never what is not. The values below come from the
   * spec, where the list ends because it ends.
   */
  it('edit spells X as twitter, and accepts more than X', () => {
    expect(recoveryPlatform('x', 'edit')).toBe('twitter')
    expect(recoveryPlatform('linkedin', 'edit')).toBe('linkedin')
    expect(recoveryPlatform('gbp', 'edit')).toBe('googlebusiness')
    expect(recoveryPlatform('facebook', 'edit')).toBe('facebook')
    expect(recoveryPlatform('telegram', 'edit')).toBe('telegram')
    // Instagram's own API has no edit for a published feed post. Absent from the
    // spec's enum, not merely absent from an error message.
    expect(recoveryPlatform('instagram', 'edit')).toBeNull()
  })

  it('unpublish accepts every channel but Instagram', () => {
    expect(recoveryPlatform('x', 'unpublish')).toBe('twitter')
    expect(recoveryPlatform('linkedin', 'unpublish')).toBe('linkedin')
    expect(recoveryPlatform('gbp', 'unpublish')).toBe('googlebusiness')
    expect(recoveryPlatform('facebook', 'unpublish')).toBe('facebook')
    expect(recoveryPlatform('telegram', 'unpublish')).toBe('telegram')
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
   * WHICH CHANNELS CAN BE RECOVERED, PINNED AS A LIST SO A CHANGE IS VISIBLE.
   *
   * ── AND IT WORKED, WHICH IS WHY THESE NUMBERS MOVED ─────────────────────────
   * This read `edit → ['x']` and carried the sentence "exactly one of this
   * product's four channels can have a live post edited". That was true when it
   * was written and had since gone stale in the direction nobody checks: the
   * capability GREW and our map still refused it, so /posts drew no Edit control
   * for LinkedIn or Google Business and nobody went looking for a button that
   * had never existed.
   *
   * Both lists below are MEASURED against `docs.zernio.com/api/openapi`,
   * 2026-08-26:
   *
   *   POST /v1/posts/{postId}/edit       platform enum
   *     [twitter, discord, facebook, reddit, linkedin, telegram, pinterest,
   *      googlebusiness, youtube, slack]
   *   POST /v1/posts/{postId}/unpublish  platform enum
   *     [threads, facebook, twitter, linkedin, youtube, pinterest, reddit,
   *      bluesky, googlebusiness, telegram]
   *
   * Instagram is absent from BOTH, and that is the one thing here that did not
   * change: Instagram's own API has no edit for a published feed post.
   */
  it('counts what is actually possible today', () => {
    expect(CHANNELS.filter((c) => canRecover(c, 'edit')).sort()).toEqual([
      'facebook',
      'gbp',
      'linkedin',
      'telegram',
      'x',
    ])
    expect(CHANNELS.filter((c) => canRecover(c, 'unpublish')).sort()).toEqual([
      'facebook',
      'gbp',
      'linkedin',
      'telegram',
      'x',
    ])
    // The invariant that survives every vocabulary change: Instagram can do
    // neither, so a writer is never offered a recovery that cannot run.
    expect(canRecover('instagram', 'edit')).toBe(false)
    expect(canRecover('instagram', 'unpublish')).toBe(false)
  })
})
