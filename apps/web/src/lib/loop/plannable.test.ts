import { describe, expect, it } from 'vitest'
import { ChannelSchema } from '@sahoda/shared'

import { isPlannableChannel, PLANNABLE_CHANNELS } from './plannable'

/**
 * The list is DERIVED from the enum, so this suite asserts the derivation and
 * not a copy of the list: a hand-written four-channel literal here would be the
 * same defect the module exists to remove, wearing a test's clothes.
 */
describe('the Loop plans for every channel the product knows', () => {
  it('is exactly the shared channel vocabulary, in order', () => {
    expect([...PLANNABLE_CHANNELS]).toEqual([...ChannelSchema.options])
  })

  it('accepts facebook and telegram, which the old four-channel list refused', () => {
    // MEASURED 2026-09-02: eligibility.ts and read.ts each carried
    // ['x','gbp','linkedin','instagram'] while the enum held six values.
    expect(isPlannableChannel('facebook')).toBe(true)
    expect(isPlannableChannel('telegram')).toBe(true)
    expect(PLANNABLE_CHANNELS.length).toBeGreaterThan(4)
  })

  it('still refuses a platform that is connected but is not a channel', () => {
    // `connections.platform` holds more values than `Channel` does.
    expect(isPlannableChannel('tiktok')).toBe(false)
    expect(isPlannableChannel('')).toBe(false)
  })
})
