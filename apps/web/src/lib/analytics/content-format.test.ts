import { describe, expect, it } from 'vitest'

import { FORMATS, classifyFormat, formatBreakdown } from '@/lib/analytics/content-format'
import type { PostMedia } from '@sahoda/shared'

const media = (mime: string | null): PostMedia =>
  ({
    id: '00000000-0000-4000-8000-000000000001',
    workspace_id: '00000000-0000-4000-8000-000000000002',
    post_id: '00000000-0000-4000-8000-000000000003',
    storage_path: 'a/b.jpg',
    mime,
    bytes: 100,
    width: 10,
    height: 10,
    alt: null,
    meta: null,
    created_at: '2026-08-01T00:00:00Z',
    updated_at: '2026-08-01T00:00:00Z',
  }) as PostMedia

/**
 * ── "TEXT" IS THE PLAUSIBLE DEFAULT AND THAT IS THE WHOLE HAZARD ─────────────
 * A post with NO media rows is a text post, which is a real finding derived
 * from a complete table. A post WITH a media row whose mime nothing recognises
 * is not a text post: it is a post we could not classify, and folding it into
 * text would report a shop as writing plain updates when it is posting photos
 * in a format this build does not know the name of.
 */
describe('classifyFormat', () => {
  it('calls a post with no attachments text', () => {
    expect(classifyFormat([])).toBe('text')
  })

  it('reads the mime for image and video', () => {
    expect(classifyFormat([media('image/jpeg')])).toBe('image')
    expect(classifyFormat([media('video/mp4')])).toBe('video')
  })

  it('calls a post carrying both a video, because that is what the reader sees', () => {
    expect(classifyFormat([media('image/png'), media('video/mp4')])).toBe('video')
  })

  it('never calls an unclassifiable attachment text', () => {
    expect(classifyFormat([media(null)])).toBe('unknown')
    expect(classifyFormat([media('application/octet-stream')])).toBe('unknown')
  })

  it('classifies on the attachment it CAN read when another is unreadable', () => {
    expect(classifyFormat([media(null), media('image/webp')])).toBe('image')
  })
})

describe('formatBreakdown', () => {
  const withMedia = (entries: Array<[string, string | null]>) => {
    const map = new Map<string, PostMedia[]>()
    for (const [postId, mime] of entries) {
      const list = map.get(postId) ?? []
      if (mime !== null) list.push(media(mime))
      map.set(postId, list)
    }
    return map
  }

  it('counts each format and keeps the total honest', () => {
    const result = formatBreakdown(
      ['a', 'b', 'c'],
      withMedia([
        ['a', 'image/jpeg'],
        ['b', 'video/mp4'],
        ['c', null],
      ]),
    )
    expect(result.kind).toBe('ready')
    if (result.kind !== 'ready') return
    expect(result.counts).toEqual({ image: 1, video: 1, text: 1, unknown: 0 })
    expect(result.posts).toBe(3)
  })

  it('is unreadable when the media read did not answer, never an all-text page', () => {
    // `listPostMedia` returns null for a failed read, and an empty map is
    // byte-identical to a workspace of text posts. Reporting the first as the
    // second is a positive false claim about what somebody published.
    const result = formatBreakdown(['a'], null)
    expect(result.kind).toBe('unreadable')
  })

  it('is empty when there are no posts at all', () => {
    expect(formatBreakdown([], new Map()).kind).toBe('empty')
  })

  it('covers every format it offers, so a bar is never silently absent', () => {
    const result = formatBreakdown(['a'], withMedia([['a', 'image/jpeg']]))
    if (result.kind !== 'ready') throw new Error('expected ready')
    for (const format of FORMATS) {
      expect(typeof result.counts[format]).toBe('number')
    }
  })
})
