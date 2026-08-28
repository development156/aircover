import { describe, expect, test } from 'vitest'

import { composerSteps, hasWriting, keepWhatWasReached, reachedAfter } from './composer-steps'

/**
 * THE THREE STEPS, AND THE ORDER THEY HAVE TO BE EARNED IN.
 *
 * Every assertion is about what a person can reach, not about a flag. The two
 * that matter most are the ones that say a step is NOT reachable, because those
 * are the whole request; and the one that says a step never withdraws what it
 * already holds, because that is the mistake this lane has already made twice.
 */
describe('reaching the composer’s steps', () => {
  test('an empty post can only be written in', () => {
    const steps = composerSteps({ body: '', channels: [] })

    expect(steps.write.access).toBe('open')
    expect(steps.channels.access).toBe('locked')
    expect(steps.send.access).toBe('locked')
  })

  test('whitespace is not writing', () => {
    // The one input that would otherwise unlock everything by accident: a
    // stray space or a newline left by a paste. Nothing has been said yet.
    expect(hasWriting('   \n\t ')).toBe(false)
    expect(composerSteps({ body: '   \n\t ', channels: [] }).channels.access).toBe('locked')
  })

  test('writing opens the channels, and channels open the send', () => {
    const written = composerSteps({ body: 'We open at 8.', channels: [] })
    expect(written.channels.access).toBe('open')
    // Still locked: written is only half of what sending needs.
    expect(written.send.access).toBe('locked')

    const picked = composerSteps({ body: 'We open at 8.', channels: ['x'] })
    expect(picked.send.access).toBe('open')
  })

  test('a locked step always says what to do about it', () => {
    const empty = composerSteps({ body: '', channels: [] })
    const written = composerSteps({ body: 'We open at 8.', channels: [] })

    // A dimmed panel with no words is indistinguishable from a broken one.
    expect(empty.channels.reason).toMatch(/write your post first/i)
    expect(empty.send.reason).toMatch(/write your post first/i)

    // And the two nothings are DIFFERENT sentences. Once something is written,
    // the send step's obstacle has moved one section up, and saying "write your
    // post first" there would point at a box that is already full.
    expect(written.send.reason).toMatch(/pick at least one channel/i)
    expect(written.send.reason).not.toMatch(/write your post first/i)
  })

  test('an open step carries no reason, because there is nothing to explain', () => {
    const steps = composerSteps({ body: 'We open at 8.', channels: ['x'] })

    expect(steps.write.reason).toBeNull()
    expect(steps.channels.reason).toBeNull()
    expect(steps.send.reason).toBeNull()
  })

  test('never takes back a step the post already holds', () => {
    // ── THE MISTAKE THIS LANE HAS ALREADY MADE TWICE TODAY ──────────────────
    // A post with channels whose body is then emptied — a select-all-delete
    // mid-edit — must not have its channel section pulled out from under it.
    // The gate is on the OFFER; a choice already made is not an offer.
    const steps = composerSteps({ body: '', channels: ['x', 'linkedin'] })

    expect(steps.channels.access).toBe('open')
    // Send stays open too: the channels are real and the post is real, so
    // scheduling it is a decision the writer is entitled to reach. What stops
    // an empty post going out is the publish path's own refusal, not a dimmed
    // panel here — and a panel that lied about WHY would be worse than either.
    expect(steps.send.access).toBe('open')
  })
})

/**
 * THE DOOR THAT HAS OPENED ONCE.
 *
 * `composerSteps` reads the post as it stands, which is right on arrival and
 * wrong mid-edit: empty the body of a one-channel draft and untick that channel
 * and the rules alone would shut step two with the pointer inside it. The latch
 * is what stops a sequence becoming a trap while someone is changing their mind.
 */
describe('a step that has already been reached', () => {
  test('stays reachable even when the rules would shut it', () => {
    const blank = composerSteps({ body: '', channels: [] })
    expect(blank.channels.access).toBe('locked')

    const held = keepWhatWasReached(blank, { channels: true, send: true })
    expect(held.channels.access).toBe('open')
    expect(held.send.access).toBe('open')
  })

  test('carries no leftover reason once it is open', () => {
    // A panel that is usable and still says "write your post first" is worse
    // than either state on its own: it is a working control calling itself
    // broken.
    const held = keepWhatWasReached(composerSteps({ body: '', channels: [] }), {
      channels: true,
      send: true,
    })

    expect(held.channels.reason).toBeNull()
    expect(held.send.reason).toBeNull()
  })

  test('changes nothing for a step never reached', () => {
    const blank = composerSteps({ body: '', channels: [] })
    const held = keepWhatWasReached(blank, { channels: false, send: false })

    expect(held.channels.access).toBe('locked')
    expect(held.channels.reason).toMatch(/write your post first/i)
    expect(held.send.access).toBe('locked')
  })

  test('the latch only ever grows', () => {
    const open = composerSteps({ body: 'We open at 8.', channels: ['x'] })
    const shut = composerSteps({ body: '', channels: [] })

    const after = reachedAfter({ channels: false, send: false }, open)
    expect(after).toEqual({ channels: true, send: true })

    // And a later render on an emptied post does not take it back.
    expect(reachedAfter(after, shut)).toEqual({ channels: true, send: true })
  })

  test('a reload starts the rules again, because the post really does say nothing', () => {
    // The latch is per sitting, never stored. A composer opened fresh on a blank
    // post has reached nothing, and step two is refused from the first paint.
    expect(
      reachedAfter({ channels: false, send: false }, composerSteps({ body: '', channels: [] })),
    ).toEqual({ channels: false, send: false })
  })
})
