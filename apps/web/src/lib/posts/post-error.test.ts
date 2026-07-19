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
