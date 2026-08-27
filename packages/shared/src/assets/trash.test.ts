import { describe, expect, it } from 'vitest'

import type { AssetUsageSite } from './delete-gate'
import { describeTrash, trashedAgo } from './trash'

const site = (over: Partial<AssetUsageSite> = {}): AssetUsageSite => ({
  postId: 'p1',
  postTitle: 'Diwali offer',
  postStatus: 'draft',
  variantStatuses: [],
  ...over,
})

describe('describeTrash never refuses, because trashing removes nothing', () => {
  // The property that separates this from `decideAssetDelete`. If a future
  // change makes trashing cascade anything, THIS is the test that should be
  // rewritten rather than quietly worked around.
  it('says nothing at all when no post uses the file', () => {
    expect(describeTrash([])).toEqual({ stillUsed: [], message: null })
  })

  it('has no refusal arm even for a published post', () => {
    const result = describeTrash([site({ postStatus: 'published' })])
    expect(result.stillUsed).toHaveLength(1)
    expect(result.message).not.toBeNull()
  })

  it('has no refusal arm for a scheduled post either', () => {
    // `decideAssetDelete` REFUSES this exact input. Trash does not, and the two
    // being different is the point rather than an oversight.
    const result = describeTrash([site({ postStatus: 'scheduled' })])
    expect(result.stillUsed).toHaveLength(1)
  })
})

describe('the sentence states both halves of what just happened', () => {
  // The trap this function exists for: a photo vanishes from the library and the
  // reader concludes their scheduled post lost it. Both claims have to be in the
  // sentence or the screen has misled them.
  it('says the posts keep the file AND that the trash is only a hide', () => {
    const message = describeTrash([site({ postStatus: 'scheduled' })]).message ?? ''
    expect(message).toMatch(/keeps it/i)
    expect(message).toMatch(/does not take it off a post/i)
  })

  it('counts posts rather than claiming a number it did not get', () => {
    expect(describeTrash([site(), site({ postId: 'p2' })]).message).toMatch(/2 posts/)
    expect(describeTrash([site()]).message).toMatch(/1 post still uses/)
  })

  it('names an untitled post as untitled rather than printing its id', () => {
    const message = describeTrash([site({ postTitle: null })]).message ?? ''
    expect(message).toMatch(/an untitled post/)
    expect(message).not.toMatch(/p1/)
  })

  it('names three posts and counts the rest', () => {
    const many = ['a', 'b', 'c', 'd', 'e'].map((id) => site({ postId: id, postTitle: id }))
    const message = describeTrash(many).message ?? ''
    expect(message).toMatch(/“a”/)
    expect(message).toMatch(/2 more posts/)
    expect(message).not.toMatch(/“d”/)
  })
})

describe('trashedAgo', () => {
  const NOW = new Date('2026-08-27T12:00:00.000Z')

  it('reads the ordinary spans', () => {
    expect(trashedAgo('2026-08-27T09:00:00.000Z', NOW)).toBe('Deleted today')
    expect(trashedAgo('2026-08-26T09:00:00.000Z', NOW)).toBe('Deleted yesterday')
    expect(trashedAgo('2026-08-20T12:00:00.000Z', NOW)).toBe('Deleted 7 days ago')
    expect(trashedAgo('2026-06-27T12:00:00.000Z', NOW)).toBe('Deleted 2 months ago')
  })

  // ── The half a rounder would get wrong ─────────────────────────────────────
  it('returns null for anything it cannot read, so the screen prints the absence mark', () => {
    expect(trashedAgo(null, NOW)).toBeNull()
    expect(trashedAgo('', NOW)).toBeNull()
    expect(trashedAgo('not a date', NOW)).toBeNull()
  })

  it('a timestamp ahead of this clock reads as today, not as a negative count', () => {
    // Clock skew between the database and the browser is ordinary. "Deleted -1
    // days ago" is not a sentence, and "deleted in the future" is not true.
    expect(trashedAgo('2026-08-28T12:00:00.000Z', NOW)).toBe('Deleted today')
  })
})
