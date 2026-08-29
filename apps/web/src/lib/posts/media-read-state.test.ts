import { describe, expect, test } from 'vitest'
import type { PostMedia } from '@sahoda/shared'

import { mediaReadState, mustSayPhotosUnreadable } from '@/lib/posts/media-read-state'

/**
 * The three answers the posts page can get about photos.
 *
 * ── THE DEFECT THIS EXISTS FOR ───────────────────────────────────────────────
 * MEASURED before this file: the page decided "could not check" with an inline
 * `mediaByPost === null`, and replacing it with a flat `false` left all 972
 * tests in `src/components/posts` and `src/app` green. A failed read then looks
 * exactly like a page whose posts have no photos, and a writer concludes their
 * post has nothing attached and uploads a second copy of what is already on it.
 *
 * Every assertion here is about the CLAIM the page is allowed to make, not
 * about wording — the sentence can be rewritten freely and these still bite.
 */

function photo(id: string): PostMedia {
  return {
    id,
    post_id: '11111111-1111-4111-8111-111111111111',
    workspace_id: '22222222-2222-4222-8222-222222222222',
    asset_id: '33333333-3333-4333-8333-333333333333',
    path: `media/${id}.jpg`,
    alt: null,
    position: 0,
    created_at: '2026-08-10T10:00:00.000Z',
  } as unknown as PostMedia
}

describe('what the page learned when it asked about photos', () => {
  test('a failed read is NOT a page with no photos', () => {
    // The pair the whole module exists to keep apart. Both render a page with
    // no thumbnails; only one of them lets a writer conclude anything.
    expect(mediaReadState(null)).toBe('unreadable')
    expect(mediaReadState(new Map())).toBe('none')
    expect(mediaReadState(null)).not.toBe(mediaReadState(new Map()))
  })

  test('the page must say so when the read failed, and must not otherwise', () => {
    expect(mustSayPhotosUnreadable(null)).toBe(true)
    expect(mustSayPhotosUnreadable(new Map())).toBe(false)
    expect(mustSayPhotosUnreadable(new Map([['post-1', [photo('a')]]]))).toBe(false)
  })

  test('a map of empty lists is a real answer, not a failure', () => {
    // The read succeeded and every post genuinely has nothing attached. Calling
    // that "unreadable" would print a worrying sentence about a working page.
    const asked = new Map<string, PostMedia[]>([
      ['post-1', []],
      ['post-2', []],
    ])
    expect(mediaReadState(asked)).toBe('none')
  })

  test('one post with a photo among many without is "some"', () => {
    const mixed = new Map<string, PostMedia[]>([
      ['post-1', []],
      ['post-2', [photo('a')]],
      ['post-3', []],
    ])
    expect(mediaReadState(mixed)).toBe('some')
  })
})
