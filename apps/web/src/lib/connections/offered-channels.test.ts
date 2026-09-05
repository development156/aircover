import { describe, expect, it } from 'vitest'
import { ChannelSchema } from '@sahoda/shared'

import { HIDDEN_FROM_OFFER } from './offer'
import { offeredChannels } from './offered-channels'

/**
 * The rule both the composer's channel row and the "Connect a channel" note read.
 * `connect-first-note.test.tsx` proves they both READ it; this proves what it says.
 */
describe('offeredChannels', () => {
  it('withholds exactly the channels /connections withholds, in schema order', () => {
    // Derived from the same set the offer rule uses, so a fourth withheld channel
    // moves this assertion with it instead of retiring it.
    const expected = ChannelSchema.options.filter((c) => !HIDDEN_FROM_OFFER.has(c))
    expect(offeredChannels()).toEqual(expected)
    // And the case that was on screen: Telegram is a real Channel and is not offered.
    expect(ChannelSchema.options).toContain('telegram')
    expect(offeredChannels()).not.toContain('telegram')
  })

  it('never takes away a channel the caller already holds', () => {
    // The composer's half of the rule. A saved post carrying Telegram keeps its
    // chip; the note, which passes nothing, does not grow one.
    expect(offeredChannels(['telegram'])).toContain('telegram')
    expect(offeredChannels(['telegram'])).toEqual(
      ChannelSchema.options.filter((c) => !HIDDEN_FROM_OFFER.has(c) || c === 'telegram'),
    )
  })

  it('reads the schema rather than a literal, so every offered channel is a Channel', () => {
    for (const channel of offeredChannels()) {
      expect(ChannelSchema.options).toContain(channel)
    }
  })
})
