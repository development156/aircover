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
    expect(sentence).toMatch(/1 post waiting for your OK/i)
  })

  test('a failed post is named, not folded into "nothing"', () => {
    const sentence = greetingState(counts({ failed: 2 }), publish())
    expect(sentence).not.toMatch(/nothing in flight/i)
    expect(sentence).toMatch(/2 posts could not go out/i)
  })

  test('a partly published post counts as failed for the reader', () => {
    const sentence = greetingState(counts({ partial: 1 }), publish())
    expect(sentence).toMatch(/1 post could not go out/i)
  })

  test('every clause reads in the order the board shows them', () => {
    const sentence = greetingState(
      counts({ draft: 2, review: 1, approved: 3, failed: 1 }),
      publish(4),
    )
    expect(sentence).toBe(
      '2 drafts you are still writing, 1 post waiting for your OK, 3 posts approved and waiting for a time, 4 posts went out, 1 post could not go out.',
    )
  })

  test('a scheduled post is in flight, and the sentence says so', () => {
    // MEASURED 2026-09-06 on the preview: the composer's Confirm schedule
    // writes `scheduled`, the board said "Scheduled · 1 post", and this line
    // said "Nothing in flight yet" directly above it.
    expect(greetingState(counts({ scheduled: 1 }), publish())).toBe('1 post set to go out.')
    expect(greetingState(counts({ scheduled: 2, approved: 1 }), publish())).toBe(
      '1 post approved and waiting for a time, 2 posts set to go out.',
    )
  })

  test('a draft is "in progress", so the word "waiting" belongs to the board alone', () => {
    // "1 draft waiting" sat 40px above "Waiting on you · 0" on the same
    // screen (MEASURED 2026-09-06). Two different things, one word.
    expect(greetingState(counts({ draft: 1 }), publish())).toBe('1 draft you are still writing.')
  })

  test('an empty workspace still gets the invitation, not a row of zeroes', () => {
    expect(greetingState(counts({}), publish())).toMatch(/nothing is happening yet/i)
  })

  test('a failed read is never dressed as zero', () => {
    expect(greetingState({ ...counts({}), status: 'unreadable' }, publish())).toMatch(
      /could not read part of your workspace/i,
    )
  })
})
