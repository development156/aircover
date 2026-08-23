import { describe, it, expect } from 'vitest'

import {
  CHANNELS_UNREADABLE_MESSAGE,
  formatChannels,
  noChannelsMessage,
} from '@/lib/loop/refusal-copy'

/**
 * Every assertion here is about the SENTENCE, never about a boolean.
 *
 * All three branches these cover return `{ ok: false }` from `startLoopCycle`,
 * so `expect(result.ok).toBe(false)` passes for all of them and distinguishes
 * none. A guard that cannot tell the three apart is not guarding the thing that
 * matters — which of three claims about the customer's account gets made.
 */
describe('the Loop refusal copy', () => {
  it('tells a workspace that never connected to CONNECT', () => {
    const message = noChannelsMessage([])
    expect(message).toBe('Connect a channel first. Sahoda has nowhere to plan for.')
    // The other claim must be absent, not merely un-asserted.
    expect(message).not.toMatch(/reconnect/i)
    expect(message).not.toMatch(/lapsed/i)
  })

  it('tells a workspace whose channel LAPSED to RECONNECT, and names it', () => {
    const message = noChannelsMessage(['instagram'])
    expect(message).toMatch(/reconnect it/i)
    expect(message).toContain('Instagram')
    expect(message).toContain('lapsed')
    // The wrong remedy must not appear. Production held 4 expired connections
    // against 2 active ones, so this is the common path, not the edge.
    expect(message).not.toMatch(/^Connect a channel first/)
  })

  it('agrees in number when more than one channel lapsed', () => {
    const message = noChannelsMessage(['instagram', 'linkedin'])
    expect(message).toContain('connections have lapsed')
    expect(message).toMatch(/reconnect them/i)
    expect(message).toContain('Instagram and LinkedIn')
    expect(message).not.toContain('connection has')
  })

  it('never blames the account when the read itself failed', () => {
    // A read that errored is not a workspace with no channels. This sentence
    // claims nothing about what the customer has connected, and it says the
    // money question out loud because that is the first thing a person asks.
    expect(CHANNELS_UNREADABLE_MESSAGE).toMatch(/nothing was charged/i)
    expect(CHANNELS_UNREADABLE_MESSAGE).not.toMatch(/connect/i)
    expect(CHANNELS_UNREADABLE_MESSAGE).not.toMatch(/lapsed/i)
  })

  it('builds the channel list with an Oxford-free "and"', () => {
    expect(formatChannels([])).toBe('')
    expect(formatChannels(['x'])).toBe('X')
    expect(formatChannels(['x', 'gbp'])).toBe('X and Google Business Profile')
    expect(formatChannels(['x', 'gbp', 'linkedin'])).toBe('X, Google Business Profile and LinkedIn')
  })
})
