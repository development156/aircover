/**
 * THE STRINGS `post_variants.format` ACCEPTS, and nothing else.
 *
 * Kept apart from the rules so this list and the database CHECK constraint can be
 * read against each other in one glance. The column's domain is a CHECK over
 * literal strings (migrations 20260819000200 and 20260820144500); adding a value
 * here without widening that CHECK produces a picker whose choice the database
 * rejects, and widening the CHECK without adding it here produces a stored value
 * `isPostFormat` reads as "nobody said".
 *
 * Pure: no imports at all.
 */

/**
 * The six kinds a channel version can declare.
 *
 * `text`, `image`, `carousel`, `video` came with the column (20260819000200).
 * `story` and `thread` were added by 20260820144500 because they are the two
 * channel-specific formats reachable through Zernio with an image-only media
 * pipeline — Instagram's `contentType: 'story'` and X's `threadItems`.
 *
 * Reel, LinkedIn document, poll, and Google's event and offer posts are
 * deliberately absent. Each needs something this product does not have yet, and
 * an unpublishable value in this list is a picker entry that saves a choice and
 * publishes something else. docs/31 §5 records which needs what.
 */
export const POST_FORMATS = ['text', 'image', 'carousel', 'story', 'thread', 'video'] as const
export type PostFormat = (typeof POST_FORMATS)[number]

export function isPostFormat(value: unknown): value is PostFormat {
  return typeof value === 'string' && (POST_FORMATS as readonly string[]).includes(value)
}
