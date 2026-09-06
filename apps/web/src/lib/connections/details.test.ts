import { describe, expect, it } from 'vitest'
import { CONSTRAINTS } from '@sahoda/shared'

import { channelDetailContent } from './details'
import { ENTRY } from './catalogue'

/**
 * The panel behind "Details" makes CLAIMS a shop owner plans around: how long a
 * post may be, how many photos it will take, how many a day it will send. A wrong
 * one is not cosmetic — it is a promise the publish step then breaks.
 */

const detailFor = (rows: readonly { term: string; detail: string }[], term: string) =>
  rows.find((row) => row.term === term)?.detail ?? null

describe('every figure is read from the engine that enforces it', () => {
  it('takes the character limit from CONSTRAINTS, never from a literal here', () => {
    const { rows } = channelDetailContent(ENTRY.instagram, 0)

    // Derived, so it cannot drift when a platform moves its limit. A hardcoded
    // 2,200 here would be a second copy, and the copy on a screen that looks like
    // marketing text is the one nobody thinks to update.
    expect(detailFor(rows, 'Longest post')).toContain(
      CONSTRAINTS.instagram.maxChars.toLocaleString('en-IN'),
    )
    expect(detailFor(rows, 'Longest post')).toContain('2,200')
  })

  it('states the per-day cap X actually enforces', () => {
    const { rows } = channelDetailContent(ENTRY.x, 0)
    expect(detailFor(rows, 'Posts per day')).toContain(String(CONSTRAINTS.x.perDayCap))
  })

  it('says a post here must include a photo, where that is true', () => {
    // There is no text-only Instagram post. Leaving this out is how an editor
    // showed green on a caption-only variant that Meta rejects at publish.
    expect(detailFor(channelDetailContent(ENTRY.instagram, 0).rows, 'Photos and video')).toMatch(
      /must include one/i,
    )
    // And must NOT say it where it is false.
    expect(detailFor(channelDetailContent(ENTRY.linkedin, 0).rows, 'Photos and video')).not.toMatch(
      /must include one/i,
    )
  })

  it('names file types in words a person uses, not in MIME types', () => {
    const detail = detailFor(channelDetailContent(ENTRY.x, 0).rows, 'Photos and video') ?? ''
    expect(detail).toMatch(/photos/i)
    expect(detail).not.toMatch(/image\//)
  })
})

describe('a channel with no adapter states no limits at all', () => {
  it('renders no invented figure for a planned channel', () => {
    // RETARGETED from facebook, which became a real channel on 2026-08-26. The
    // guarantee is unchanged; the example moved to one that is still planned.
    const { rows } = channelDetailContent(ENTRY.pinterest, 0)

    // `CONSTRAINTS` has no entry to read, and a plausible-looking number that no
    // engine enforces is the fabricated-figure failure this project has hit before.
    expect(detailFor(rows, 'Longest post')).toBeNull()
    expect(detailFor(rows, 'Posts per day')).toBeNull()
    expect(rows.every((row) => !/\d/.test(row.detail))).toBe(true)
  })

  it('offers no slot row, because nothing here can use a slot', () => {
    // "0 accounts connected" would read as a state the customer could change.
    expect(detailFor(channelDetailContent(ENTRY.youtube, 0).rows, 'Slots used here')).toBeNull()
  })

  it('says plainly that connecting is not possible', () => {
    // RETARGETED from telegram for the same reason as above.
    const { rows } = channelDetailContent(ENTRY.pinterest, 0)
    expect(rows[0]?.detail).toMatch(/cannot post here yet/i)
  })
})

describe('the slot row is where a slot is defined', () => {
  it('says a slot is spent per ACCOUNT when none is connected', () => {
    expect(detailFor(channelDetailContent(ENTRY.instagram, 0).rows, 'Slots used here')).toMatch(
      /one slot/i,
    )
  })

  it('counts accounts and slots together at two, so they cannot be read apart', () => {
    // THE WHOLE POINT. Two Instagram accounts are two slots and one channel, and
    // this row is where that is said in full.
    const detail = detailFor(channelDetailContent(ENTRY.instagram, 2).rows, 'Slots used here') ?? ''
    expect(detail).toContain('2 accounts')
    expect(detail).toContain('2 slots')
  })

  it('invites a second account only while one is connected, not zero', () => {
    expect(detailFor(channelDetailContent(ENTRY.instagram, 1).rows, 'Slots used here')).toMatch(
      /connect more/i,
    )
  })
})

describe('the readiness row explains the rung rather than repeating it', () => {
  it('is narrow about what "not yet confirmed live" means', () => {
    const { rows, note } = channelDetailContent(ENTRY.x, 0)

    // The exact claim: the code is there and has run, it has never reached the
    // platform for real. "It might not work" would be vaguer than the truth.
    expect(rows[0]?.detail).toMatch(/no post has yet been proven to arrive/i)
    expect(note).toMatch(/first live post is the proof/i)
  })

  it('claims a live send only where one has happened', () => {
    expect(channelDetailContent(ENTRY.instagram, 0).rows[0]?.detail).toMatch(/has reached/i)
    expect(channelDetailContent(ENTRY.instagram, 0).note).toBeUndefined()
  })
})
