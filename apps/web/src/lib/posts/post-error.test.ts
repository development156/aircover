import { describe, expect, test } from 'vitest'

import { mapPostError } from './post-error'

describe('mapPostError', () => {
  test('reads the same for a missing post and a post in another workspace', () => {
    // No existence oracle: RLS hides both as "no rows", and the copy must not
    // let a caller distinguish them.
    const missing = mapPostError({ code: 'PGRST116', message: 'no rows returned' })
    const forbidden = mapPostError({ code: '42501', message: 'permission denied for table posts' })
    expect(missing).toBe(forbidden)
  })

  test('explains a rejected status without naming the database constraint', () => {
    const copy = mapPostError({
      code: '23514',
      message: 'new row violates check constraint "posts_status_check"',
    })
    expect(copy).toMatch(/status/i)
    expect(copy).not.toMatch(/constraint|posts_status_check|23514/i)
  })

  test('a lifecycle refusal names who can act and what they can change', () => {
    // The trigger raises P0001 with this token as its whole message, so the
    // code carries nothing and the token must be matched from the message.
    const copy = mapPostError({ code: 'P0001', message: 'POST_LIFECYCLE_ROLE' })
    expect(copy).toBe(
      'Only an owner or editor can change when this goes out, or move it along. Ask one of them.',
    )
    expect(copy).not.toMatch(/POST_LIFECYCLE_ROLE|P0001/)
  })

  test('a P0001 raise WITHOUT the lifecycle token stays generic', () => {
    // The guard on the token, not on the code: any other RAISE from any other
    // function must not be told it is a role problem.
    expect(mapPostError({ code: 'P0001', message: 'SOMETHING_ELSE' })).toBe(
      'Could not save this post. Try again.',
    )
  })

  test('falls back to generic copy for an unrecognised error', () => {
    expect(mapPostError({ code: 'XX000', message: 'internal error' })).toMatch(
      /could not|try again/i,
    )
  })

  test('handles a null error without throwing', () => {
    expect(typeof mapPostError(null)).toBe('string')
    expect(typeof mapPostError(undefined)).toBe('string')
  })

  test('never leaks a raw database message, SQL state, or table name', () => {
    const hostile = {
      code: '23505',
      message:
        'duplicate key value violates unique constraint "post_variants_post_id_channel_key"\n' +
        'DETAIL: Key (post_id, channel)=(abc, x) already exists.\n' +
        'at Object.<anonymous> (/srv/app/pg.js:42:17)\n' +
        'SELECT * FROM posts WHERE workspace_id = $1',
    }
    const copy = mapPostError(hostile)
    for (const leak of [
      'duplicate key',
      'unique constraint',
      'post_variants_post_id_channel_key',
      'DETAIL',
      'SELECT',
      'pg.js',
      '23505',
      'workspace_id',
    ]) {
      expect(copy.toLowerCase()).not.toContain(leak.toLowerCase())
    }
  })

  test('stays a single short sentence so it fits an inline error banner', () => {
    const copy = mapPostError({ code: 'XX000', message: 'x'.repeat(5000) })
    expect(copy.length).toBeLessThan(160)
    expect(copy).not.toContain('\n')
  })
})

/**
 * THE REVIEW-GATE TOKENS. Each RPC raises a bare token as its whole message
 * (P0001, so the code says nothing), and each has its own reader sentence.
 * Every sentence must name the situation, never the token, and the delete
 * refusal must say the post went out, because "could not save" over a post
 * that is live on a channel is the vaguer sentence CLAUDE.md forbids.
 */
describe('mapPostError · the review gate', () => {
  const cases: Array<[string, RegExp, RegExp]> = [
    ['POST_NOT_SUBMITTABLE', /only a draft can be sent for review/i, /already moved on/i],
    ['POST_NOT_RETURNABLE', /not waiting on anyone/i, /nothing to send back/i],
    ['POST_ALREADY_GOING_OUT', /already going out/i, /wait for it to finish/i],
    ['REASON_REQUIRED', /say in a sentence what should change/i, /writer knows/i],
    ['POST_HAS_PUBLISH_EVIDENCE', /already went out/i, /cannot be deleted/i],
  ]

  test.each(cases)('%s reads as a sentence about the situation', (token, claim, remedy) => {
    const copy = mapPostError({ code: 'P0001', message: token })
    expect(copy).toMatch(claim)
    expect(copy).toMatch(remedy)
    expect(copy).not.toContain(token)
    expect(copy).not.toBe('Could not save this post. Try again.')
  })

  test('the token is matched inside a longer raise, the way PostgREST wraps it', () => {
    expect(
      mapPostError({ code: 'P0001', message: 'ERROR: POST_HAS_PUBLISH_EVIDENCE (SQLSTATE P0001)' }),
    ).toMatch(/already went out/i)
  })
})
