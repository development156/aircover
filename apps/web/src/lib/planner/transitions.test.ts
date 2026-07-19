import { describe, expect, test } from 'vitest'
import { PostStatusSchema, type PostStatus } from '@sahoda/shared'

import { APPROVABLE_FROM, canApprove } from './transitions'

/**
 * The approve transition is an ALLOWLIST, exhaustively pinned over the frozen
 * status enum: a new status added to the shared schema shows up here as a
 * failing expectation, forcing a deliberate decision instead of silently
 * becoming (un)approvable.
 */
describe('canApprove', () => {
  const EXPECTED: Record<PostStatus, boolean> = {
    idea: true,
    draft: true,
    review: true,
    approved: false,
    scheduled: false,
    publishing: false,
    published: false,
    failed: false,
    expired: false,
  }

  test.each(PostStatusSchema.options)('%s', (status) => {
    expect(canApprove(status)).toBe(EXPECTED[status])
  })

  test('the allowlist and the predicate agree', () => {
    for (const status of PostStatusSchema.options) {
      expect(APPROVABLE_FROM.includes(status as (typeof APPROVABLE_FROM)[number])).toBe(
        canApprove(status),
      )
    }
  })
})
