import { describe, expect, it } from 'vitest'
import type { Channel } from '@sahoda/shared'

import { joinNames, scheduleGapNote, unconnectedFrom } from './connection-gap'

const set = (...channels: Channel[]) => new Set<Channel>(channels)

describe('unconnectedFrom', () => {
  it('names the picked channels with no live connection', () => {
    expect(unconnectedFrom(['instagram', 'linkedin'], set('instagram'))).toEqual(['linkedin'])
  })

  it('is empty when everything picked is connected', () => {
    expect(unconnectedFrom(['instagram'], set('instagram', 'x'))).toEqual([])
  })

  it('says nothing at all when the connection state is UNKNOWN', () => {
    // A failed read must not be rendered as "not connected" — that sends someone to
    // reconnect an account that is fine. Same rule as the wallet's unreadable balance.
    expect(unconnectedFrom(['instagram', 'linkedin'], undefined)).toEqual([])
  })

  it('does not report a connected channel the post is not aimed at', () => {
    expect(unconnectedFrom(['instagram'], set('instagram'))).toEqual([])
  })

  it('names a repeated channel ONCE', () => {
    // `post.channels` is a text[] off the row, not a set, and the planner hands it
    // over untouched. Passed straight through, a duplicate reached the copy as
    // "LinkedIn and LinkedIn" — which reads as two separate broken accounts, and
    // pushed the sentence onto its plural verb for a single channel.
    expect(unconnectedFrom(['linkedin', 'linkedin'], set())).toEqual(['linkedin'])
    expect(unconnectedFrom(['linkedin', 'instagram', 'linkedin'], set())).toEqual([
      'linkedin',
      'instagram',
    ])
  })
})

describe('joinNames', () => {
  it.each([
    [[], ''],
    [['LinkedIn'], 'LinkedIn'],
    [['X', 'LinkedIn'], 'X and LinkedIn'],
    [['X', 'Google Business Profile', 'LinkedIn'], 'X, Google Business Profile and LinkedIn'],
  ])('%j → %j', (names, expected) => {
    expect(joinNames(names)).toBe(expected)
  })
})

describe('scheduleGapNote', () => {
  it('is null when there is no gap, so the ordinary note renders instead', () => {
    expect(scheduleGapNote([], true)).toBeNull()
  })

  it('says the post still goes out when only SOME channels are missing', () => {
    const note = scheduleGapNote(['LinkedIn'], true)

    expect(note).toContain('goes out on its own')
    expect(note).toContain('LinkedIn isn’t connected')
    expect(note).toContain('won’t go out there')
  })

  it('says nothing goes out when EVERY channel is missing', () => {
    // The distinction the reader needs: with one channel connected the post is
    // still published somewhere. With none, the schedule is a promise with no way
    // to keep it, and leading with "this goes out" would bury that.
    const note = scheduleGapNote(['LinkedIn'], false)

    expect(note).toContain('Nothing goes out')
    expect(note).not.toContain('goes out on its own')
  })

  it('agrees with itself about plurals', () => {
    expect(scheduleGapNote(['X', 'LinkedIn'], true)).toContain('X and LinkedIn aren’t connected')
    expect(scheduleGapNote(['X', 'LinkedIn'], false)).toContain('X and LinkedIn aren’t connected')
  })
})
