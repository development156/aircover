import { describe, it, expect } from 'vitest'
import { PostStatusSchema } from '../enums'
import { isDispatchable, DISPATCHABLE_STATUSES } from './schedule'

describe('isDispatchable', () => {
  it('accepts exactly the two statuses the dispatcher acts on', () => {
    // The gate is `status IN ('approved','scheduled') AND scheduled_at IS NOT NULL`.
    // Pinned against the full enum so a new post status cannot join it silently.
    const accepted = PostStatusSchema.options.filter((s) =>
      isDispatchable(s, '2026-07-25T09:00:00Z'),
    )

    expect(accepted).toEqual(['approved', 'scheduled'])
  })

  it('requires a scheduled_at — an approved post with no time is not due for anything', () => {
    expect(isDispatchable('approved', null)).toBe(false)
    expect(isDispatchable('scheduled', null)).toBe(false)
  })

  it('does not treat an empty or unparseable scheduled_at as a time', () => {
    // A blank string is not a schedule. Coercing it would make the post due at the epoch,
    // which under the grace rule means instantly expired.
    expect(isDispatchable('approved', '')).toBe(false)
    expect(isDispatchable('approved', 'next tuesday')).toBe(false)
  })

  it('rejects the terminal and pre-approval statuses', () => {
    for (const status of ['idea', 'draft', 'review', 'published', 'failed', 'expired'] as const) {
      expect(isDispatchable(status, '2026-07-25T09:00:00Z')).toBe(false)
    }
  })

  it('rejects `publishing`, which is a run already in flight', () => {
    // Re-dispatching this would double-post: something is mid-attempt on it right now.
    expect(isDispatchable('publishing', '2026-07-25T09:00:00Z')).toBe(false)
  })

  it('exposes the accepted statuses for query builders to reuse', () => {
    // The SQL candidate query and this predicate must not drift; the query builds its
    // IN-list from this constant rather than repeating the literals.
    expect([...DISPATCHABLE_STATUSES]).toEqual(['approved', 'scheduled'])
  })
})
