import { describe, expect, it } from 'vitest'

import { PostStatusSchema, VariantPublishStatusSchema } from '../enums'
import type { PostStatus, VariantPublishStatus } from '../enums'
import {
  LOCKING_POST_STATUSES,
  LOCKING_VARIANT_STATUSES,
  decideAssetDelete,
  isLockedSite,
  nameOfPost,
  type AssetUsageSite,
} from './delete-gate'

const site = (over: Partial<AssetUsageSite> = {}): AssetUsageSite => ({
  postId: '11111111-1111-4111-8111-111111111111',
  postTitle: 'Diwali offer',
  postStatus: 'draft',
  variantStatuses: [],
  ...over,
})

describe('decideAssetDelete — nothing uses the file', () => {
  it('allows the delete and asks for no confirmation', () => {
    const decision = decideAssetDelete([])
    expect(decision.ok).toBe(true)
    if (!decision.ok) throw new Error('unreachable')
    expect(decision.detach).toEqual([])
    // Not "removes it from 0 posts" — a warning about nothing is noise that
    // teaches the reader to click through the one that matters.
    expect(decision.message).toBeNull()
  })
})

/**
 * The expected verdict for EVERY post status, written out by hand.
 *
 * Deliberately not derived from `LOCKING_POST_STATUSES`. A loop that reads the
 * module's own constant to compute what it expects is self-consistent under any
 * mutation of that constant — dropping 'partial' from the list would silently
 * flip both the expectation and the result, and the sweep would stay green while
 * the gate developed a hole. This table is a second, independent statement of
 * the rule, so the two have to agree.
 */
const EXPECTED_POST_LOCK: Readonly<Record<PostStatus, boolean>> = {
  idea: false,
  draft: false,
  review: false,
  approved: false,
  scheduled: true,
  publishing: true,
  published: true,
  partial: true,
  failed: false,
  expired: false,
}

const EXPECTED_VARIANT_LOCK: Readonly<Record<VariantPublishStatus, boolean>> = {
  pending: false,
  scheduled: true,
  publishing: true,
  published: true,
  failed: false,
  skipped: false,
}

describe('decideAssetDelete — every post status is decided, not just the remembered ones', () => {
  // The exhaustive sweep. `PostStatusSchema.options` is the live enum, so a NEW
  // status fails the completeness assertion below rather than slipping through
  // undecided.
  it('the expectation table covers every status the enum defines', () => {
    expect(Object.keys(EXPECTED_POST_LOCK).sort()).toEqual([...PostStatusSchema.options].sort())
    expect(Object.keys(EXPECTED_VARIANT_LOCK).sort()).toEqual(
      [...VariantPublishStatusSchema.options].sort(),
    )
  })

  for (const status of PostStatusSchema.options) {
    const locks = EXPECTED_POST_LOCK[status]

    it(`${status} → ${locks ? 'REFUSES' : 'warns'}`, () => {
      const decision = decideAssetDelete([site({ postStatus: status })])
      expect(decision.ok).toBe(!locks)
    })
  }

  it('the exported constant matches the hand-written table', () => {
    const fromConstant = PostStatusSchema.options.filter((s: PostStatus) =>
      LOCKING_POST_STATUSES.includes(s),
    )
    const fromTable = PostStatusSchema.options.filter((s: PostStatus) => EXPECTED_POST_LOCK[s])
    expect([...fromConstant].sort()).toEqual([...fromTable].sort())
  })

  it('locks exactly scheduled, publishing, published and partial', () => {
    const locking = PostStatusSchema.options.filter((status: PostStatus) =>
      isLockedSite(site({ postStatus: status })),
    )
    expect([...locking].sort()).toEqual(['partial', 'published', 'publishing', 'scheduled'].sort())
  })

  it('approved warns rather than locking — approving is not scheduling', () => {
    const decision = decideAssetDelete([site({ postStatus: 'approved' })])
    expect(decision.ok).toBe(true)
  })

  it('failed and expired do not lock — nothing went out and nothing is queued', () => {
    expect(decideAssetDelete([site({ postStatus: 'failed' })]).ok).toBe(true)
    expect(decideAssetDelete([site({ postStatus: 'expired' })]).ok).toBe(true)
  })
})

describe('decideAssetDelete — a variant can lock a post whose own status does not', () => {
  for (const publishStatus of VariantPublishStatusSchema.options) {
    const locks = EXPECTED_VARIANT_LOCK[publishStatus]

    it(`draft post + variant ${publishStatus} → ${locks ? 'REFUSES' : 'warns'}`, () => {
      const decision = decideAssetDelete([
        site({ postStatus: 'draft', variantStatuses: [publishStatus] }),
      ])
      expect(decision.ok).toBe(!locks)
    })
  }

  it('reports the VARIANT reason, not the post status, when the variant is what locks', () => {
    const decision = decideAssetDelete([
      site({ postStatus: 'draft', variantStatuses: ['published'] }),
    ])
    expect(decision.ok).toBe(false)
    if (decision.ok) throw new Error('unreachable')
    expect(decision.message).toContain('already published on a channel')
  })

  it('one locking variant among several is enough', () => {
    const statuses: VariantPublishStatus[] = ['pending', 'skipped', 'failed', 'scheduled']
    expect(decideAssetDelete([site({ postStatus: 'draft', variantStatuses: statuses })]).ok).toBe(
      false,
    )
  })
})

describe('decideAssetDelete — the refusal names where the file is used', () => {
  it('quotes the post title and says why it is locked', () => {
    const decision = decideAssetDelete([
      site({ postTitle: 'Diwali offer', postStatus: 'scheduled' }),
    ])
    expect(decision.ok).toBe(false)
    if (decision.ok) throw new Error('unreachable')
    expect(decision.message).toContain('Diwali offer')
    expect(decision.message).toContain('scheduled to go out')
  })

  it('describes an untitled post as untitled rather than printing its id', () => {
    const decision = decideAssetDelete([
      site({ postTitle: null, postStatus: 'published', postId: 'abc-123' }),
    ])
    expect(decision.ok).toBe(false)
    if (decision.ok) throw new Error('unreachable')
    expect(decision.message).toContain('an untitled post')
    expect(decision.message).not.toContain('abc-123')
  })

  it('treats a whitespace-only title as no title', () => {
    expect(nameOfPost(site({ postTitle: '   ' }))).toBe('an untitled post')
  })

  it('names three posts and counts the rest', () => {
    const decision = decideAssetDelete([
      site({ postTitle: 'One', postStatus: 'scheduled' }),
      site({ postTitle: 'Two', postStatus: 'scheduled' }),
      site({ postTitle: 'Three', postStatus: 'scheduled' }),
      site({ postTitle: 'Four', postStatus: 'scheduled' }),
      site({ postTitle: 'Five', postStatus: 'scheduled' }),
    ])
    expect(decision.ok).toBe(false)
    if (decision.ok) throw new Error('unreachable')
    expect(decision.message).toContain('One')
    expect(decision.message).toContain('Three')
    expect(decision.message).not.toContain('Four')
    expect(decision.message).toContain('2 more posts')
    // The total is still stated, so "3 named" never reads as "3 in total".
    expect(decision.message).toContain('5 posts')
  })

  it('a single extra post is counted in the singular', () => {
    const decision = decideAssetDelete([
      site({ postTitle: 'One', postStatus: 'published' }),
      site({ postTitle: 'Two', postStatus: 'published' }),
      site({ postTitle: 'Three', postStatus: 'published' }),
      site({ postTitle: 'Four', postStatus: 'published' }),
    ])
    if (decision.ok) throw new Error('unreachable')
    expect(decision.message).toContain('1 more post')
    expect(decision.message).not.toContain('1 more posts')
  })
})

describe('decideAssetDelete — a mixed set refuses on the locked half', () => {
  it('refuses, and still reports the drafts that would have detached', () => {
    const decision = decideAssetDelete([
      site({ postTitle: 'Draft one', postStatus: 'draft' }),
      site({ postTitle: 'Going out Thursday', postStatus: 'scheduled' }),
    ])
    expect(decision.ok).toBe(false)
    if (decision.ok) throw new Error('unreachable')
    expect(decision.locked).toHaveLength(1)
    expect(decision.detach).toHaveLength(1)
    expect(decision.message).toContain('Going out Thursday')
  })
})

describe('decideAssetDelete — the warn path asks before it removes', () => {
  it('names the drafts the file comes off', () => {
    const decision = decideAssetDelete([
      site({ postTitle: 'Draft one', postStatus: 'draft' }),
      site({ postTitle: 'Draft two', postStatus: 'idea' }),
    ])
    expect(decision.ok).toBe(true)
    if (!decision.ok) throw new Error('unreachable')
    expect(decision.detach).toHaveLength(2)
    expect(decision.message).toContain('Draft one')
    expect(decision.message).toContain('Draft two')
    expect(decision.message).toContain('2 posts')
  })

  it('does not say why a draft is unlocked — there is no reason to give', () => {
    const decision = decideAssetDelete([site({ postTitle: 'Draft one', postStatus: 'draft' })])
    if (!decision.ok) throw new Error('unreachable')
    expect(decision.message).not.toContain('(')
  })
})

describe('decideAssetDelete — hostile and malformed input', () => {
  it('survives a non-array', () => {
    // The rows come from a database read that can be handed anything by a
    // caller under test or a future PostgREST shape change. A throw here would
    // fail the DELETE OPEN — the caller would see an exception, not a refusal.
    const decision = decideAssetDelete(undefined as unknown as AssetUsageSite[])
    expect(decision.ok).toBe(true)
  })

  it('survives a site whose variantStatuses is not an array', () => {
    const bad = { ...site(), variantStatuses: 'published' } as unknown as AssetUsageSite
    expect(isLockedSite(bad)).toBe(false)
  })

  it('an unknown post status does not lock, and does not throw', () => {
    const bad = site({ postStatus: 'invented' as PostStatus })
    expect(decideAssetDelete([bad]).ok).toBe(true)
  })
})
