import 'server-only'

import type { PostMedia } from '@sahoda/shared'

/**
 * WHAT THIS SHOP ACTUALLY POSTS: PHOTOS, VIDEO, OR WORDS.
 *
 * ── DERIVED FROM `post_media`, NOT FROM A PLATFORM ───────────────────────────
 * The only chart on this page whose source is entirely our own database and
 * whose completeness we can therefore vouch for: a post with no media row has
 * no media, full stop, so "text" here is a finding rather than a guess.
 *
 * ── AND THAT IS EXACTLY WHERE IT COULD GO WRONG ──────────────────────────────
 * "Text" is the plausible default, so it is the answer a lazy classifier gives
 * to everything it cannot read. A post carrying an attachment whose mime this
 * build does not recognise is NOT a text post; it is a post we could not
 * classify, and folding it in would report a shop as writing plain updates when
 * it is posting photos in a format we have not met. `unknown` is its own count
 * and the chart draws it as the absence mark.
 *
 * A failed media read is `unreadable` for the same reason `listPostMedia`
 * returns null rather than an empty map: an empty map is byte-identical to a
 * workspace of text posts, and reporting the first as the second is a positive
 * false claim about what somebody published.
 *
 * The classification is pure. Only `formatBreakdownFor` touches the database.
 */

export const FORMATS = ['image', 'video', 'text', 'unknown'] as const

export type ContentFormat = (typeof FORMATS)[number]

export const FORMAT_LABELS: Readonly<Record<ContentFormat, string>> = {
  image: 'Photo',
  video: 'Video',
  text: 'Words only',
  unknown: 'Not recognised',
}

/**
 * One post's format, from its attachments.
 *
 * A post carrying both a photo and a video is a VIDEO: that is what plays in
 * the feed and what the reader of the post actually sees.
 */
export function classifyFormat(attachments: readonly PostMedia[]): ContentFormat {
  if (attachments.length === 0) return 'text'
  let sawImage = false
  for (const attachment of attachments) {
    const mime = attachment.mime?.toLowerCase() ?? ''
    if (mime.startsWith('video/')) return 'video'
    if (mime.startsWith('image/')) sawImage = true
  }
  // Attachments exist and none of them could be read. NOT text: this post has
  // something on it and we cannot say what.
  return sawImage ? 'image' : 'unknown'
}

export type FormatBreakdown =
  | { kind: 'ready'; counts: Record<ContentFormat, number>; posts: number }
  /** No posts in the window, so there is nothing to break down. */
  | { kind: 'empty' }
  /** The media read did not answer. Never reported as a page of text posts. */
  | { kind: 'unreadable' }

export function formatBreakdown(
  postIds: readonly string[],
  media: ReadonlyMap<string, PostMedia[]> | null,
): FormatBreakdown {
  if (postIds.length === 0) return { kind: 'empty' }
  if (media === null) return { kind: 'unreadable' }

  const counts: Record<ContentFormat, number> = { image: 0, video: 0, text: 0, unknown: 0 }
  for (const postId of postIds) {
    counts[classifyFormat(media.get(postId) ?? [])] += 1
  }
  return { kind: 'ready', counts, posts: postIds.length }
}
