import type { ZernioCommentedPost } from '@sahoda/publishing'
import { describe, expect, it } from 'vitest'

import { postsCarryingComments } from './commented-posts'

/**
 * `[LIVE 2026-08-10]` — `GET /inbox/comments` returned SIX posts for `@testingg53`, of
 * which exactly ONE carried comments. Both the endpoint's name and our own comment on
 * it said "the posts that have comments"; that is not what it returns.
 *
 * Left alone, `rows > 0` is permanently true, so the comments surface renders "Showing
 * your comments" for a workspace with no comments anywhere and the "No comments yet"
 * state can never appear. That is the same false-claim class `emptiness.ts` exists to
 * prevent, on the one surface named after it.
 */
const post = (over: Partial<ZernioCommentedPost> = {}): ZernioCommentedPost => ({
  id: 'p1',
  platform: 'instagram',
  accountId: '6a75caf7d0fe733d1afcc1f4',
  content: 'a caption',
  commentCount: 0,
  ...over,
})

/** The live page, reduced to the field under test. */
const LIVE_PAGE = [
  post({ id: '18552339547076779', content: 'TEMPLE', commentCount: 0 }),
  post({ id: '18104495198175832', content: 'LINUX', commentCount: 0 }),
  post({ id: '18057499664685525', content: 'hey there look at my new headphones' }),
  post({ id: '18277022635290264', content: '', commentCount: 2 }),
  post({ id: '18104441855596739', content: 'Sahoda test post — please ignore' }),
  post({ id: '18112494568953121', content: '' }),
]

describe('postsCarryingComments', () => {
  it('keeps only the posts that actually have comments', () => {
    const view = postsCarryingComments(LIVE_PAGE)
    expect(view.posts.map((p) => p.id)).toEqual(['18277022635290264'])
  })

  it('counts what it dropped, so the omission can be stated rather than hidden', () => {
    expect(postsCarryingComments(LIVE_PAGE).withoutComments).toBe(5)
  })

  it('reports an empty surface when every post came back with zero comments', () => {
    const view = postsCarryingComments(LIVE_PAGE.filter((p) => p.commentCount === 0))
    expect(view.posts).toHaveLength(0)
    expect(view.withoutComments).toBe(5)
  })

  it('preserves order and identity of the posts it keeps', () => {
    const view = postsCarryingComments([post({ id: 'a', commentCount: 3 }), post({ id: 'b' })])
    expect(view.posts).toEqual([post({ id: 'a', commentCount: 3 })])
  })

  it('drops a negative or absent count rather than trusting it', () => {
    // Never observed; a count that is not a positive integer is not evidence of a
    // comment, and treating it as one is how a zero becomes a claim.
    const odd = [
      post({ id: 'x', commentCount: -1 }),
      post({ id: 'y', commentCount: undefined as unknown as number }),
    ]
    expect(postsCarryingComments(odd).posts).toHaveLength(0)
  })
})
