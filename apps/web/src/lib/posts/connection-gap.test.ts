import { describe, expect, it } from 'vitest'
import { toChannelSet, type Channel } from '@sahoda/shared'

import { joinNames, scheduleGapNote, unconnectedFrom } from './connection-gap'

const set = (...channels: Channel[]) => new Set<Channel>(channels)

describe('unconnectedFrom', () => {
  it('names the picked channels with no live connection', () => {
    expect(unconnectedFrom(toChannelSet(['instagram', 'linkedin']), set('instagram'))).toEqual([
      'linkedin',
    ])
  })

  it('is empty when everything picked is connected', () => {
    expect(unconnectedFrom(toChannelSet(['instagram']), set('instagram', 'x'))).toEqual([])
  })

  it('says nothing at all when the connection state is UNKNOWN', () => {
    // A failed read must not be rendered as "not connected" — that sends someone to
    // reconnect an account that is fine. Same rule as the wallet's unreadable balance.
    expect(unconnectedFrom(toChannelSet(['instagram', 'linkedin']), undefined)).toEqual([])
  })

  it('does not report a connected channel the post is not aimed at', () => {
    expect(unconnectedFrom(toChannelSet(['instagram']), set('instagram'))).toEqual([])
  })

  it('names a repeated channel ONCE, because the row boundary deduplicated it', () => {
    // ── THE MUTATION TEST FOR THIS CONSUMER ──────────────────────────────────
    // `unconnectedFrom` no longer deduplicates. It used to, defensively, and that
    // private second copy is what let `PublishNow` disagree with it and render a
    // repeated channel twice. The guarantee now comes from `toChannelSet` — so
    // delete the `new Set` there and THIS test fails, with the copy reading
    // "LinkedIn and LinkedIn": two separate broken accounts where there is one,
    // on a plural verb the count had no right to.
    //
    // `posts.channels` is still a bare text[] with no unique constraint. The
    // duplicate is storable; it just cannot survive the read any more.
    expect(unconnectedFrom(toChannelSet(['linkedin', 'linkedin']), set())).toEqual(['linkedin'])
    expect(unconnectedFrom(toChannelSet(['linkedin', 'instagram', 'linkedin']), set())).toEqual([
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
