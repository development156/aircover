import { describe, expect, test } from 'vitest'
import { PostStatusSchema, type PostStatus } from '@sahoda/shared'

import { awaitsDecision, awaitsRepair, needsAPerson, splitQueue } from './queue'
import { bulkApproveMessage } from './state'
import type { DisplayPost } from '@/lib/posts/display-post'

const post = (id: string, intent: PostStatus): DisplayPost =>
  ({ id, intent, title: id, channels: [] }) as unknown as DisplayPost

/**
 * ── THE SWEEP THAT WOULD HAVE PROVED NOTHING ─────────────────────────────────
 * The tempting shape here is
 *
 *   for (const s of PostStatusSchema.options)
 *     expect(needsAPerson(s)).toBe(rungFor(s) === 'urgent')
 *
 * which reads the implementation to compute what it expects, so it is
 * self-consistent under ANY mutation of the rung table and green whatever the
 * answer becomes. Same defect the assets lane measured on `LOCKING_POST_STATUSES`
 * (LEARNINGS, 2026-08-20): 32 of 33 tests stayed green when the constant was
 * gutted, because the expectation moved with it.
 *
 * So the expected answer is written out by hand, once, and a completeness
 * assertion checks the hand-written map against the live enum — a new
 * `PostStatus` fails here rather than silently defaulting to "does not need a
 * person", which is exactly how a new failure state ends up whispering.
 */
const EXPECTED: Record<PostStatus, { queue: boolean; decision: boolean }> = {
  idea: { queue: false, decision: false },
  draft: { queue: false, decision: false },
  review: { queue: true, decision: true },
  approved: { queue: false, decision: false },
  scheduled: { queue: false, decision: false },
  publishing: { queue: false, decision: false },
  published: { queue: false, decision: false },
  partial: { queue: true, decision: false },
  failed: { queue: true, decision: false },
  expired: { queue: false, decision: false },
}

describe('what lands on the approvals queue', () => {
  test('the hand-written expectation covers every status the enum has', () => {
    expect(Object.keys(EXPECTED).sort()).toEqual([...PostStatusSchema.options].sort())
  })

  test.each(PostStatusSchema.options)('%s', (status) => {
    const expected = EXPECTED[status]
    expect(needsAPerson(status), `${status} on the queue?`).toBe(expected.queue)
    expect(awaitsDecision(status), `${status} awaits a decision?`).toBe(expected.decision)
    expect(awaitsRepair(status), `${status} awaits a repair?`).toBe(
      expected.queue && !expected.decision,
    )
  })

  test('a draft is not on the queue — unfinished is not the same as waiting on you', () => {
    expect(needsAPerson('draft')).toBe(false)
  })

  test('every queued post is in exactly one half', () => {
    for (const status of PostStatusSchema.options) {
      if (!needsAPerson(status)) continue
      expect(awaitsDecision(status) !== awaitsRepair(status)).toBe(true)
    }
  })
})

describe('splitQueue', () => {
  const posts = [
    post('a', 'review'),
    post('b', 'failed'),
    post('c', 'draft'),
    post('d', 'partial'),
    post('e', 'published'),
  ]

  test('separates decisions from repairs and counts both', () => {
    const queue = splitQueue(posts)
    expect(queue.decisions.map((p) => p.id)).toEqual(['a'])
    expect(queue.repairs.map((p) => p.id)).toEqual(['b', 'd'])
    expect(queue.total).toBe(3)
  })

  test('total is the sum of the halves, so the badge and the header agree', () => {
    // The badge shows `total` and the two lists show the halves. If total were
    // computed from anything but these two arrays the rail could say 5 over a
    // page showing 4 — the exact drift nav-item.tsx warns about.
    const queue = splitQueue(posts)
    expect(queue.total).toBe(queue.decisions.length + queue.repairs.length)
  })

  test('an empty workspace produces an empty queue, not a missing one', () => {
    expect(splitQueue([])).toEqual({ decisions: [], repairs: [], total: 0 })
  })
})

describe('the sentence a bulk approve produces', () => {
  test('a clean run says only what happened', () => {
    expect(bulkApproveMessage({ ok: true, approved: 4, moved: 0, failed: 0 })).toBe('4 approved')
  })

  test('a stale list reports BOTH halves — never just the approvals', () => {
    // The defect this whole type exists for: four succeeded and one did not, and
    // a boolean would force "Approved" over a post that never moved.
    const message = bulkApproveMessage({ ok: true, approved: 4, moved: 1, failed: 0 })
    expect(message).toContain('4 approved')
    expect(message).toContain('1 had already moved on')
  })

  test('a row that had already moved is never called a failure', () => {
    // Different remedies: "moved on" means reload, "could not be saved" means
    // retry. Collapsing them sends people to do the wrong one.
    const message = bulkApproveMessage({ ok: true, approved: 0, moved: 3, failed: 0 })
    expect(message).toContain('had already moved on')
    expect(message).not.toMatch(/could not be saved|failed/i)
  })

  test('a write error is reported as a retryable failure, distinctly', () => {
    expect(bulkApproveMessage({ ok: true, approved: 0, moved: 0, failed: 2 })).toContain(
      'could not be saved',
    )
  })

  test('approving nothing does not claim a success', () => {
    expect(bulkApproveMessage({ ok: true, approved: 0, moved: 0, failed: 0 })).not.toMatch(
      /approved/,
    )
  })
})
