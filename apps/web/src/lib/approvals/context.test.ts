import { describe, expect, test } from 'vitest'

import {
  approvalGroups,
  authorshipLine,
  COMMENT_MAX,
  excerpt,
  historyLine,
  isOwnPost,
  panelState,
  parseApprovalRow,
  parseCommentRow,
  REASON_MAX,
  reviewLine,
  validateReason,
  whoIs,
} from './context'

const ME = 'user_me'
const THEM = 'user_them'

const row = (overrides: Partial<ReturnType<typeof parseApprovalRow>> & { decision: string }) => ({
  id: 'a1',
  post_id: 'p1',
  actor: ME,
  reason: null,
  created_at: '2026-09-06T09:00:00.000Z',
  ...overrides,
})

/**
 * WHO WROTE IT, in the reader's terms.
 *
 * `origin` is the only honest source for "Sahoda wrote this". `manual` is the
 * one origin that means a person did; anything else is a model. The person is
 * then "you" or "a teammate" from `created_by` against the caller's own id.
 */
describe('authorshipLine', () => {
  test('a plan_week post was written by Sahoda whoever the row says created it', () => {
    expect(authorshipLine({ origin: 'plan_week', created_by: ME }, ME)).toBe('Written by Sahoda')
  })

  test('radar, playbook and every non-manual origin read the same', () => {
    for (const origin of ['radar', 'playbook', 'remix', 'loop']) {
      expect(authorshipLine({ origin, created_by: THEM }, ME)).toBe('Written by Sahoda')
    }
  })

  test('a manual post by the caller is "you"', () => {
    expect(authorshipLine({ origin: 'manual', created_by: ME }, ME)).toBe('Written by you')
  })

  test('a manual post by someone else is "a teammate", never their id', () => {
    const line = authorshipLine({ origin: 'manual', created_by: THEM }, ME)
    expect(line).toBe('Written by a teammate')
    expect(line).not.toContain(THEM)
  })

  test('a signed-out reader still gets a sentence', () => {
    expect(authorshipLine({ origin: 'manual', created_by: THEM }, null)).toBe(
      'Written by a teammate',
    )
  })
})

describe('isOwnPost', () => {
  test('true only when created_by is the caller', () => {
    expect(isOwnPost({ created_by: ME }, ME)).toBe(true)
    expect(isOwnPost({ created_by: THEM }, ME)).toBe(false)
    expect(isOwnPost({ created_by: null }, ME)).toBe(false)
    expect(isOwnPost({ created_by: ME }, null)).toBe(false)
  })
})

describe('excerpt', () => {
  test('a short body is returned whole', () => {
    expect(excerpt('Chai and buns.')).toBe('Chai and buns.')
  })

  test('a long body stops near 160 characters on a word and marks the cut', () => {
    const body = 'word '.repeat(60).trim()
    const cut = excerpt(body)!
    expect(cut.length).toBeLessThanOrEqual(161)
    expect(cut.endsWith('…')).toBe(true)
    // Never mid-word: the character before the mark is not a letter split off.
    expect(cut).not.toMatch(/\bwor…$/)
  })

  test('a null or blank body is null, not an empty string', () => {
    expect(excerpt(null)).toBeNull()
    expect(excerpt('   ')).toBeNull()
  })

  test('newlines collapse so a row stays one line', () => {
    expect(excerpt('one\n\ntwo')).toBe('one two')
  })
})

/**
 * THE HISTORY ROWS, GROUPED. The latest row per post is what the queue shows;
 * the whole list is what the post page shows.
 */
describe('approvalGroups', () => {
  test('groups by post and keeps newest first', () => {
    const groups = approvalGroups([
      row({ id: 'a1', decision: 'submitted', created_at: '2026-09-01T00:00:00Z' }),
      row({
        id: 'a2',
        decision: 'returned',
        reason: 'Add a photo',
        created_at: '2026-09-02T00:00:00Z',
      }),
      row({ id: 'a3', post_id: 'p2', decision: 'approved', created_at: '2026-09-03T00:00:00Z' }),
    ])
    expect(groups.get('p1')?.map((r) => r.id)).toEqual(['a2', 'a1'])
    expect(groups.get('p2')?.map((r) => r.id)).toEqual(['a3'])
  })
})

describe('reviewLine · who submitted or last returned it', () => {
  test('the latest row is a submission by the caller', () => {
    const line = reviewLine([row({ decision: 'submitted', actor: ME })], ME)
    expect(line).toBe('Sent for review by you')
  })

  test('the latest row is a return by a teammate, with the reason', () => {
    const line = reviewLine(
      [row({ decision: 'returned', actor: THEM, reason: 'Needs the price' })],
      ME,
    )
    expect(line).toBe('Sent back by a teammate: Needs the price')
  })

  test('an approval by a teammate', () => {
    expect(reviewLine([row({ decision: 'approved', actor: THEM })], ME)).toBe(
      'Approved by a teammate',
    )
  })

  test('no rows is null, so the row prints nothing rather than a guess', () => {
    expect(reviewLine([], ME)).toBeNull()
  })
})

describe('historyLine · the post page, one sentence per row', () => {
  test('names the act, the person and the reason', () => {
    expect(historyLine(row({ decision: 'returned', actor: THEM, reason: 'Too long' }), ME)).toBe(
      'Sent back by a teammate: Too long',
    )
    expect(historyLine(row({ decision: 'submitted', actor: ME }), ME)).toBe(
      'Sent for review by you',
    )
    expect(historyLine(row({ decision: 'approved', actor: ME }), ME)).toBe('Approved by you')
  })
})

describe('whoIs', () => {
  test('never prints an id', () => {
    expect(whoIs(THEM, ME)).toBe('a teammate')
    expect(whoIs(ME, ME)).toBe('you')
    expect(whoIs(null, ME)).toBe('a teammate')
  })
})

/**
 * THE FINISH PANEL'S STATE SENTENCE. What the post is waiting on, in a line.
 */
describe('panelState', () => {
  const at = '2026-09-10T03:30:00.000Z'

  test('a post in review is waiting', () => {
    expect(
      panelState(
        { intent: 'review', approvedBy: null, approvedAt: null, scheduledAt: null },
        ME,
        'Asia/Kolkata',
      ),
    ).toBe('Waiting for review')
  })

  test('an approved post names who and when', () => {
    expect(
      panelState(
        { intent: 'approved', approvedBy: ME, approvedAt: at, scheduledAt: null },
        ME,
        'Asia/Kolkata',
      ),
    ).toBe('Approved by you on 10 Sept 2026')
    expect(
      panelState(
        { intent: 'approved', approvedBy: THEM, approvedAt: at, scheduledAt: null },
        ME,
        'Asia/Kolkata',
      ),
    ).toBe('Approved by a teammate on 10 Sept 2026')
  })

  test('an approved post whose approver was not recorded says only that it was approved', () => {
    expect(
      panelState(
        { intent: 'approved', approvedBy: null, approvedAt: null, scheduledAt: null },
        ME,
        'Asia/Kolkata',
      ),
    ).toBe('Approved')
  })

  test('a scheduled post is booked for its time in the workspace zone', () => {
    expect(
      panelState(
        { intent: 'scheduled', approvedBy: ME, approvedAt: at, scheduledAt: at },
        ME,
        'Asia/Kolkata',
      ),
    ).toBe('Booked for 10 Sept 2026, 09:00 am IST')
  })

  test('a draft has no state sentence', () => {
    expect(
      panelState(
        { intent: 'draft', approvedBy: null, approvedAt: null, scheduledAt: null },
        ME,
        'Asia/Kolkata',
      ),
    ).toBeNull()
  })
})

describe('validateReason', () => {
  test('empty is refused with the sentence the RPC would use', () => {
    expect(validateReason('   ')).toEqual({
      ok: false,
      message: 'Say in a sentence what should change, so the writer knows what to do.',
    })
  })

  test('within the limit is accepted trimmed', () => {
    expect(validateReason('  Add the price.  ')).toEqual({ ok: true, reason: 'Add the price.' })
  })

  test('over the limit is refused, and the limit is named', () => {
    const result = validateReason('x'.repeat(REASON_MAX + 1))
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.message).toContain(String(REASON_MAX))
  })
})

describe('parseApprovalRow / parseCommentRow', () => {
  test('a well-formed approval row parses', () => {
    expect(
      parseApprovalRow({
        id: 'a',
        post_id: 'p',
        actor: 'u',
        decision: 'submitted',
        reason: null,
        created_at: 'now',
      }),
    ).toEqual({
      id: 'a',
      post_id: 'p',
      actor: 'u',
      decision: 'submitted',
      reason: null,
      created_at: 'now',
    })
  })

  test('an unknown decision is refused rather than rendered', () => {
    expect(
      parseApprovalRow({
        id: 'a',
        post_id: 'p',
        actor: 'u',
        decision: 'deleted',
        reason: null,
        created_at: 'now',
      }),
    ).toBeNull()
  })

  test('a comment row keeps deleted_at so the UI can say "removed"', () => {
    expect(
      parseCommentRow({
        id: 'c',
        post_id: 'p',
        author: 'u',
        body: 'hi',
        created_at: 'now',
        deleted_at: 'later',
      }),
    ).toEqual({
      id: 'c',
      post_id: 'p',
      author: 'u',
      body: 'hi',
      created_at: 'now',
      deleted_at: 'later',
    })
    expect(parseCommentRow({ id: 'c' })).toBeNull()
  })

  test('the comment limit is the column limit', () => {
    expect(COMMENT_MAX).toBe(2000)
  })
})
