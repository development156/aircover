import { describe, expect, test } from 'vitest'
import { ChannelSchema } from '@sahoda/shared'

import { CHANNEL, ZERNIO_SPELLINGS, zernioPlatform } from './platform-spelling'

/**
 * ONE VOCABULARY, NOT THREE.
 *
 * The two spellings lived in three files. The property that matters is that the two
 * directions are inverses of each other: a channel written out as Zernio's word and
 * read back must land on the channel it started as. Three hand-written copies could
 * not have that property proved of them; one module can.
 */
describe('platform spelling', () => {
  test('round-trips every channel the schema admits', () => {
    for (const channel of ChannelSchema.options) {
      expect(CHANNEL[zernioPlatform(channel)]).toBe(channel)
    }
  })

  test('translates the two names Zernio spells differently', () => {
    expect(zernioPlatform('x')).toBe('twitter')
    expect(zernioPlatform('gbp')).toBe('googlebusiness')
    expect(CHANNEL.twitter).toBe('x')
    expect(CHANNEL.googlebusiness).toBe('gbp')
  })

  test('passes a channel Zernio already names correctly straight through', () => {
    expect(zernioPlatform('instagram')).toBe('instagram')
    expect(zernioPlatform('facebook')).toBe('facebook')
  })

  test('refuses a platform this product has no channel for', () => {
    // A fallback here is how a Reddit comment becomes an Instagram row.
    expect(CHANNEL.reddit).toBeUndefined()
    expect(CHANNEL.whatsapp).toBeUndefined()
  })

  test('carries every channel the schema admits, so a new one cannot be missed', () => {
    for (const channel of ChannelSchema.options) {
      expect(CHANNEL[channel]).toBe(channel)
    }
    // And the hand-written half is exactly the two, so a third added silently
    // to one direction fails the round-trip above rather than passing here.
    expect(Object.keys(ZERNIO_SPELLINGS).sort()).toEqual(['googlebusiness', 'twitter'])
  })
})
