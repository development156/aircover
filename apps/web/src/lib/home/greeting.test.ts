import { describe, expect, test } from 'vitest'

import { greetingFor, greetingState } from './greeting'
import type { PostCounts } from './posts'
import type { PublishSummary } from './publishing'

/**
 * The one sentence under the greeting, and the board directly beneath it, are
 * read as ONE claim. MEASURED on the wt-core preview, 2026-09-06: a workspace
 * whose only post was in review rendered "Nothing in flight yet. Plan a week
 * and it starts filling in." over a board that said "Waiting on you · 1 post".
 * Both were true of the columns they read, and the screen contradicted itself.
 *
 * `review`, `failed` and `partial` are exactly the intents `needsAPerson` puts
 * in the queue (lib/approvals/queue.ts). The sentence has to know about the
 * same three, or it denies the queue it sits above.
 */

const counts = (byStatus: Record<string, number>): PostCounts => ({
  status: 'ok',
  byStatus,
  byChannel: [],
  byOrigin: {},
  total: Object.values(byStatus).reduce((a, b) => a + b, 0),
  capped: false,
  coveredFrom: null,
})

const publish = (live = 0): PublishSummary => ({
  status: live > 0 ? 'ok' : 'empty',
  attempts: live,
  succeeded: live,
  failed: 0,
  live,
  fixture: 0,
  capped: false,
  coveredFrom: null,
})

describe('the greeting reads the workspace clock', () => {
  test('one instant, two zones, two greetings', () => {
    // 04:30Z is 10:00 in Kolkata and 13:30 in Tokyo.
    const at = new Date('2026-09-06T04:30:00.000Z')
    expect(greetingFor(at)).toBe('Good morning')
    expect(greetingFor(at, 'Asia/Tokyo')).toBe('Good afternoon')
    expect(greetingFor(at, 'America/New_York')).toBe('Good morning')
  })
})

describe('the greeting sentence agrees with the queue beneath it', () => {
  test('a post in review is in flight, and the sentence says so', () => {
    const sentence = greetingState(counts({ review: 1 }), publish())
    expect(sentence).not.toMatch(/nothing in flight/i)
    expect(sentence).toMatch(/1 post waiting for review/i)
  })

  test('a failed post is named, not folded into "nothing"', () => {
    const sentence = greetingState(counts({ failed: 2 }), publish())
    expect(sentence).not.toMatch(/nothing in flight/i)
    expect(sentence).toMatch(/2 posts failed/i)
  })

  test('a partly published post counts as failed for the reader', () => {
    const sentence = greetingState(counts({ partial: 1 }), publish())
    expect(sentence).toMatch(/1 post failed/i)
  })

  test('every clause reads in the order the board shows them', () => {
    const sentence = greetingState(
      counts({ draft: 2, review: 1, approved: 3, failed: 1 }),
      publish(4),
    )
    expect(sentence).toBe(
      '2 drafts in progress, 1 post waiting for review, 3 posts approved, 4 posts out, 1 post failed.',
    )
  })

  test('a scheduled post is in flight, and the sentence says so', () => {
    // MEASURED 2026-09-06 on the preview: the composer's Confirm schedule
    // writes `scheduled`, the board said "Scheduled · 1 post", and this line
    // said "Nothing in flight yet" directly above it.
    expect(greetingState(counts({ scheduled: 1 }), publish())).toBe('1 post scheduled.')
    expect(greetingState(counts({ scheduled: 2, approved: 1 }), publish())).toBe(
      '1 post approved, 2 posts scheduled.',
    )
  })

  test('a draft is "in progress", so the word "waiting" belongs to the board alone', () => {
    // "1 draft waiting" sat 40px above "Waiting on you · 0" on the same
    // screen (MEASURED 2026-09-06). Two different things, one word.
    expect(greetingState(counts({ draft: 1 }), publish())).toBe('1 draft in progress.')
  })

  test('an empty workspace still gets the invitation, not a row of zeroes', () => {
    expect(greetingState(counts({}), publish())).toMatch(/nothing in flight yet/i)
  })

  test('a failed read is never dressed as zero', () => {
    expect(greetingState({ ...counts({}), status: 'unreadable' }, publish())).toMatch(
      /couldn.t be read/i,
    )
  })
})
