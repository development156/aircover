import { describe, it, expect } from 'vitest'

import { readOptions } from './store'

/**
 * `post_variants.extras` → `PublishVariant.options`.
 *
 * ── THE LINK THAT WAS DEAD FOR THE GOOGLE BUTTON ────────────────────────────
 * Both ENDS of that chain had tests — the composer stored the value, the builder
 * emitted the object — and the row-to-variant step in the middle did not. That
 * step was where the value was being dropped, for weeks, while everything else
 * stayed green.
 *
 * `extras` is one shared jsonb column that several lanes write, so the standing
 * rule is that a shape we do not recognise is a reason to IGNORE the field, never
 * to fail the publish.
 */
describe('readOptions', () => {
  it('reads a whole set of controls off a real-looking row', () => {
    expect(
      readOptions({
        hashtags: ['#chai'],
        poll: { options: ['Chai', 'Coffee'], durationMinutes: 1440 },
        firstComment: '#chai #pune',
        collaborators: ['friend'],
        aiGenerated: true,
        gbpTopic: 'EVENT',
        gbpEvent: { title: 'Sale', startDate: '2026-11-01', endDate: '2026-11-05' },
      }),
    ).toEqual({
      poll: { options: ['Chai', 'Coffee'], durationMinutes: 1440 },
      firstComment: '#chai #pune',
      collaborators: ['friend'],
      aiGenerated: true,
      gbpTopic: 'EVENT',
      gbpEvent: { title: 'Sale', startDate: '2026-11-01', endDate: '2026-11-05' },
    })
  })

  it('is undefined for a row with no controls — never an empty object', () => {
    // `{}` would put a `platformSpecificData` key on the wire that says we
    // considered the controls and chose nothing. Different claim, different bytes.
    expect(readOptions({ hashtags: ['#chai'] })).toBeUndefined()
    expect(readOptions({})).toBeUndefined()
    expect(readOptions(null)).toBeUndefined()
    expect(readOptions('not an object')).toBeUndefined()
    expect(readOptions([1, 2, 3])).toBeUndefined()
  })

  it('drops a junk field and keeps the rest, rather than failing the publish', () => {
    expect(
      readOptions({ poll: 'not an object', firstComment: '#chai', aiGenerated: 'yes' }),
    ).toEqual({ firstComment: '#chai' })
  })

  it('ignores a poll whose answers are not strings', () => {
    expect(readOptions({ poll: { options: [1, 2, 3] } })).toBeUndefined()
    expect(readOptions({ poll: { options: ['a', 5, 'b'] } })).toEqual({
      poll: { options: ['a', 'b'] },
    })
  })

  it('takes only true for the AI label, never a truthy string', () => {
    expect(readOptions({ aiGenerated: 'true' })).toBeUndefined()
    expect(readOptions({ aiGenerated: 1 })).toBeUndefined()
    expect(readOptions({ aiGenerated: true })).toEqual({ aiGenerated: true })
  })

  it('ignores a Google topic it does not recognise', () => {
    // 'BANANA' passes Zernio's own dry run (MEASURED, docs/32 §4.3). It does not
    // pass here, and a topic we cannot act on states no intent to act on.
    expect(readOptions({ gbpTopic: 'BANANA', gbpEvent: { title: 'x', startDate: 'y' } })).toBeUndefined()
  })

  it('keeps an event with missing halves so the builder can say which is missing', () => {
    // NOT dropped: an event with no date must reach `refuseGbpTopic` and produce
    // 'An event needs a start date', rather than vanishing and publishing as an
    // ordinary update — which is the format-lies-about-itself failure.
    expect(readOptions({ gbpTopic: 'EVENT', gbpEvent: { title: 'Sale' } })).toEqual({
      gbpTopic: 'EVENT',
      gbpEvent: { title: 'Sale', startDate: '' },
    })
  })

  it('drops an empty first comment and empty collaborator list', () => {
    expect(readOptions({ firstComment: '   ', collaborators: [] })).toBeUndefined()
  })
})
