import { describe, it, expect } from 'vitest'
import { buildPlatformData } from '@sahoda/publishing'

import { parseExtras } from './variant-extras'
import { optionsFromExtras } from './variant-options'

/**
 * THE WHOLE CHAIN, END TO END, WITHOUT A DATABASE.
 *
 * ── WHY THIS IS ONE TEST AND NOT FOUR ───────────────────────────────────────
 * The Google button had tests at both ENDS — the composer stored the value, the
 * builder emitted the object — and stayed dead for weeks because a step in the
 * middle dropped it. Four passing tests of four links do not prove a chain; only
 * following one value the whole way does.
 *
 * So this takes what a control writes, puts it through the parse that guards the
 * database column, through the translation the publish path uses, and into the
 * builder — and asserts the bytes at the far end.
 */
describe('a control the writer fills in reaches the wire', () => {
  it('carries an X poll from the composer to platformSpecificData', () => {
    // 1. What `PollOptions` calls `onExtrasChange` with.
    const written = { poll: { options: ['Chai', 'Coffee'], durationMinutes: 1440 } }

    // 2. What `saveVariant` stores, through the schema that guards the column.
    const stored = parseExtras(written)
    expect(stored.poll).toEqual(written.poll)

    // 3. What the publish path reads it as.
    const options = optionsFromExtras(stored)

    // 4. What Zernio is handed.
    const built = buildPlatformData({
      channel: 'x',
      format: 'text',
      content: { channel: 'x', text: 'Chai or coffee?', media: [] },
      ...(options ? { options } : {}),
    })
    expect(built).toEqual({
      ok: true,
      data: { poll: { options: ['Chai', 'Coffee'], duration_minutes: 1440 } },
    })
  })

  it('carries a Google event, with the date shape Google needs', () => {
    const stored = parseExtras({
      gbpTopic: 'EVENT',
      gbpEvent: { title: 'Diwali sale', startDate: '2026-11-01' },
    })
    const built = buildPlatformData({
      channel: 'gbp',
      format: 'text',
      content: { channel: 'gbp', summary: 'Come by', media: [] },
      ...(optionsFromExtras(stored) ? { options: optionsFromExtras(stored) } : {}),
    })
    expect(built).toEqual({
      ok: true,
      data: {
        topicType: 'EVENT',
        event: { title: 'Diwali sale', schedule: { startDate: { year: 2026, month: 11, day: 1 } } },
      },
    })
  })

  it('survives a round-trip through jsonb without losing a field', () => {
    // `extras` is stored as jsonb and read back as `unknown`. Anything that does
    // not survive JSON is a field that works in the editor and vanishes by the
    // time the publisher looks.
    const written = {
      poll: { question: 'Which?', options: ['a', 'b'], durationCode: 'ONE_DAY' },
      firstComment: '#chai',
      collaborators: ['friend'],
      aiGenerated: true,
      gbpTopic: 'OFFER' as const,
      gbpOffer: { couponCode: 'SAVE10' },
    }
    const roundTripped = parseExtras(JSON.parse(JSON.stringify(parseExtras(written))))
    expect(optionsFromExtras(roundTripped)).toEqual(optionsFromExtras(parseExtras(written)))
    expect(optionsFromExtras(roundTripped)).toMatchObject({
      firstComment: '#chai',
      aiGenerated: true,
      gbpTopic: 'OFFER',
    })
  })

  it('does not carry a poll the writer opened and left empty', () => {
    // The checkbox writes `{ options: ['', ''] }` the moment it is ticked.
    // Carrying that forward would refuse the post for a control they never used.
    expect(optionsFromExtras(parseExtras({ poll: { options: ['', '  '] } }))).toBeUndefined()
  })

  it('leaves an unrelated lane’s keys alone', () => {
    // `extras` is one shared column and a read-modify-write here is a round trip.
    // Stripping what we do not recognise would delete another lane's data on save.
    const stored = parseExtras({ aiGenerated: true, someOtherLaneKey: { deep: 1 } })
    expect((stored as Record<string, unknown>).someOtherLaneKey).toEqual({ deep: 1 })
  })

  it('is undefined for a version with no controls at all', () => {
    expect(optionsFromExtras(parseExtras({ hashtags: ['#chai'] }))).toBeUndefined()
  })
})
