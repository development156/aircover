import { describe, expect, it } from 'vitest'

import { MIN_AUDIENCE, MIN_WINDOW_DAYS as GROWTH_DAYS } from './observe/audience-growth'
import { MIN_POSTS_PER_CHANNEL, MIN_WINDOW_DAYS as CHANNEL_DAYS } from './observe/channel-return'
import {
  MIN_POSTS_PER_WINDOW as DRIFT_POSTS,
  MIN_WINDOW_DAYS as DRIFT_DAYS,
} from './observe/tone-drift'
import { brainWaiting, waitingSentence } from './waiting'

/**
 * The empty state's CLAIMS, never its wording.
 *
 * `lib/inbox/emptiness.test.ts` is the pattern: assert what the sentence
 * promises and what it must never say, so the copy can be rewritten freely and
 * the guarantee survives the rewrite.
 */
describe('brainWaiting', () => {
  it('says never-examined when no pass has recorded this workspace', () => {
    expect(brainWaiting(null)).toEqual({ state: 'never-examined' })
  })

  it('never claims to have looked at a workspace it has not looked at', () => {
    // The whole point of the two states. A missing row is also what the runner
    // writes when the pass THREW, so claiming patience here would render a
    // broken reader as diligence.
    const result = brainWaiting(null)
    expect(result.state).not.toBe('waiting')
    expect(JSON.stringify(result)).not.toMatch(/last looked|waiting/i)
  })

  it('carries the day it looked, so silence can be dated', () => {
    const result = brainWaiting({ computedOn: '2026-08-23', declines: {}, written: 0 })
    expect(result).toMatchObject({ state: 'waiting', lastLookedOn: '2026-08-23' })
  })

  it('turns each declining computer into one sentence', () => {
    const result = brainWaiting({
      computedOn: '2026-08-23',
      declines: { tone_drift: 'no_posts', channel_return: 'no_metrics' },
      written: 0,
    })
    expect(result.state === 'waiting' && result.reasons).toHaveLength(2)
  })

  it('drops a kind it does not recognise rather than inventing a sentence for it', () => {
    const result = brainWaiting({
      computedOn: '2026-08-23',
      declines: { vibes: 'too_few_posts' },
      written: 0,
    })
    expect(result.state === 'waiting' && result.reasons).toEqual([])
  })
})

describe('waitingSentence', () => {
  it('states the real post floor, read from the computer that gates on it', () => {
    const s = waitingSentence('tone_drift', 'too_few_posts')!
    expect(s).toContain(String(DRIFT_POSTS))
  })

  it('states the real window per kind, and the kinds genuinely differ', () => {
    // A habit claim needs three weeks on both sides; a "which channel pays"
    // claim needs a fortnight of measurements. A single hardcoded number in the
    // copy would be wrong for one of them.
    expect(waitingSentence('tone_drift', 'window_too_short')).toContain(String(DRIFT_DAYS))
    expect(waitingSentence('channel_return', 'window_too_short')).toContain(String(CHANNEL_DAYS))
    expect(DRIFT_DAYS).not.toBe(CHANNEL_DAYS)
  })

  it('states the real channel floor for a channel comparison', () => {
    expect(waitingSentence('channel_return', 'too_few_posts')).toContain(
      String(MIN_POSTS_PER_CHANNEL),
    )
  })

  it('states the real audience floor', () => {
    expect(waitingSentence('audience_growth', 'audience_too_small')).toContain(String(MIN_AUDIENCE))
    expect(waitingSentence('audience_growth', 'window_too_short')).toContain(String(GROWTH_DAYS))
  })

  it('offers a remedy the reader can actually perform, where one exists', () => {
    // no-impossible-remedy, in the one place it is easiest to get wrong: a
    // metrics shortfall is fixed by connecting an account, and a span shortfall
    // is fixed by nothing but waiting — so the second must not pretend
    // otherwise.
    expect(waitingSentence('channel_return', 'no_metrics')).toMatch(/connect an account/i)
    expect(waitingSentence('tone_drift', 'window_too_short')).toMatch(/time/i)
    expect(waitingSentence('tone_drift', 'window_too_short')).not.toMatch(/connect|reload|refresh/i)
  })

  it('says nothing for a verdict, because a verdict is not a wait', () => {
    // "Your two channels are too close to call" is an ANSWER. Printing it in a
    // waiting list would tell a customer to keep posting for a result that has
    // already arrived.
    for (const reason of [
      'too_close_to_call',
      'change_too_small',
      'not_improving',
      'lengths_too_similar',
    ]) {
      expect(waitingSentence('channel_return', reason)).toBeNull()
    }
  })

  it('says nothing for a reason it has never heard of', () => {
    expect(waitingSentence('tone_drift', 'sunspots')).toBeNull()
  })

  it('never states that the customer has no posts unless that is the reason given', () => {
    // The precision rule: "we have not measured enough" and "you have published
    // nothing" are different claims about the reader's business.
    expect(waitingSentence('tone_drift', 'window_too_short')).not.toMatch(/\bhas none\b/i)
    expect(waitingSentence('tone_drift', 'no_posts')).toMatch(/none/i)
  })
})
