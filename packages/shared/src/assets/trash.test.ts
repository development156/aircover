import { describe, expect, it } from 'vitest'

import type { AssetUsageSite } from './delete-gate'
import { describeBulkTrash, describeEmptyTrash, describeTrash, trashedAgo } from './trash'

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

describe('describeBulkTrash counts files rather than naming posts', () => {
  const used = (n: number) => ({
    usage: Array.from({ length: n }, (_, i) => site({ postId: `p${i}` })),
  })

  it('says nothing when none of them is on a post', () => {
    expect(describeBulkTrash([used(0), used(0)])).toBeNull()
  })

  it('counts the FILES still in use, not the posts', () => {
    // Two files across five posts is "2 of them", never "5". The person is
    // acting on files; the post count is a different question.
    const message = describeBulkTrash([used(3), used(2), used(0)]) ?? ''
    expect(message).toMatch(/2 of them are still on posts/)
    expect(message).not.toMatch(/5/)
  })

  it('reads correctly for exactly one', () => {
    expect(describeBulkTrash([used(1), used(0)])).toMatch(/1 of them is still on a post/)
  })

  it('repeats the guarantee, because a bulk action is where it is easiest to lose', () => {
    expect(describeBulkTrash([used(1)])).toMatch(/does not take a file off a post/)
  })

  it('survives a file whose usage was never read', () => {
    // `usage` can be absent on a card built by a read that did not ask. Counting
    // it as "in use" would invent a claim; counting it as "not in use" is the
    // same shape as the empty case and is what the sentence already means.
    expect(describeBulkTrash([{ usage: undefined as never }])).toBeNull()
  })
})

describe('describeEmptyTrash states BOTH numbers', () => {
  it('the ordinary case names only what went', () => {
    expect(describeEmptyTrash(3, 0, false)).toBe('Deleted 3 files for good.')
    expect(describeEmptyTrash(1, 0, false)).toBe('Deleted 1 file for good.')
  })

  // ── The half a single number would hide ────────────────────────────────────
  it('a file the gate refused is REPORTED, not folded into the total', () => {
    // "Deleted 10" when two were kept is a lie a person cannot detect until
    // they look. Nothing failed, so it is not an error either.
    const message = describeEmptyTrash(8, 2, false)
    expect(message).toMatch(/Deleted 8 files for good/)
    expect(message).toMatch(/2 files stayed/)
    expect(message).toMatch(/still use them/)
  })

  it('says so plainly when the gate refused everything', () => {
    expect(describeEmptyTrash(0, 3, false)).toMatch(/^Nothing was deleted\./)
    expect(describeEmptyTrash(0, 3, false)).toMatch(/3 files stayed/)
  })

  it('reads correctly for exactly one kept', () => {
    expect(describeEmptyTrash(2, 1, false)).toMatch(
      /1 file stayed, because a post that cannot lose it/,
    )
  })
})

/**
 * THE THIRD NUMBER, WHICH IS THE ONE NOBODY WAS TOLD.
 *
 * `readTrashedAssets` reads at most 200 rows and hands back `capped` when it hit
 * that ceiling. `emptyTrash` walked the 200 it was given and reported "Deleted
 * 200 files for good", full stop — a claim that the trash is now empty, made
 * about a trash that still held 300 files. The flag existed the whole time and
 * nothing consumed it.
 *
 * So `more` is a REQUIRED argument rather than an optional one. An optional
 * third parameter would let the next call site forget it in exactly the way this
 * one did, and the compiler would say nothing.
 */
describe('describeEmptyTrash when the trash held more than one pass could reach', () => {
  it('never claims the trash is empty when it is not', () => {
    const message = describeEmptyTrash(200, 0, true)
    expect(message).toMatch(/Deleted 200 files for good/)
    expect(message).toMatch(/still in the trash/i)
  })

  /**
   * The remedy has to be one that WORKS. Pressing again reads the next 200, so
   * naming the button is a real instruction rather than a shrug. A reload would
   * not be: it shows the same trash and deletes nothing.
   */
  it('names a remedy that actually works, which is pressing it again', () => {
    expect(describeEmptyTrash(200, 0, true)).toMatch(/again/i)
    expect(describeEmptyTrash(200, 0, true)).not.toMatch(/reload|refresh/i)
  })

  it('invents no number it does not have', () => {
    // We know there is MORE. We do not know how much more, and a figure here
    // would be the same defect in the other direction.
    const message = describeEmptyTrash(200, 0, true)
    const numbers = (message.match(/\d+/g) ?? []).map(Number)
    expect(numbers).toEqual([200])
  })

  it('says both halves when the gate also refused some', () => {
    const message = describeEmptyTrash(180, 20, true)
    expect(message).toMatch(/Deleted 180 files for good/)
    expect(message).toMatch(/20 files stayed/)
    expect(message).toMatch(/still in the trash/i)
  })

  it('adds nothing when the whole trash fitted in one pass', () => {
    expect(describeEmptyTrash(3, 0, false)).toBe('Deleted 3 files for good.')
  })

  it('carries no em dash, which is the standing ruling for prose', () => {
    expect(describeEmptyTrash(200, 20, true)).not.toMatch(/[—–]/)
  })
})
