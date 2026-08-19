import { CONSTRAINTS, ChannelSchema } from '@sahoda/shared'
import type { AssetKind } from '@sahoda/shared'

/**
 * What kind of thing a file is, for the library's filter.
 *
 * ── ONLY ONE KIND CAN BE WRITTEN TODAY, AND THAT IS NOT A BUG TO WORK AROUND ─
 * The `assets.kind` column allows image, video and document. Every channel's
 * `mediaTypes` in the Constraint Engine lists four IMAGE types and nothing else,
 * and `sniffImage` — the only thing that establishes a file's real type from its
 * own bytes — recognises exactly those four. So a video could be stored and could
 * never be published, and a document could be stored and could never be verified.
 *
 * Storing one anyway would put a tile in the library that no post can use and no
 * message explains. The upload path therefore accepts what it can prove and
 * refuses the rest, which today means every accepted file is an image.
 *
 * `KINDS_WITH_UPLOAD` is what the screen may offer. The remaining kinds are shown
 * as unbuilt — as `<div>`s, never `<button disabled>` — so the library says what
 * it will hold without pretending it holds it.
 */

/** Mime types the upload path can prove, derived from the engine rather than restated. */
export const UPLOADABLE_MIME_TYPES: readonly string[] = [
  ...new Set(ChannelSchema.options.flatMap((channel) => CONSTRAINTS[channel].mediaTypes)),
].sort()

/**
 * The kind for a mime the upload path has already PROVEN by sniffing bytes.
 *
 * Returns null for anything else rather than guessing. A prefix test — "starts
 * with image/" — would call `image/svg+xml` a photo, and an SVG is a script
 * container that no channel accepts.
 */
export function kindForProvenMime(mime: string): AssetKind | null {
  return UPLOADABLE_MIME_TYPES.includes(mime) ? 'image' : null
}

/** Kinds a person can actually add today. */
export const KINDS_WITH_UPLOAD: readonly AssetKind[] = ['image']

/** Kinds the column allows but nothing can yet write. Rendered as unbuilt. */
export const KINDS_NOT_YET_UPLOADABLE: readonly AssetKind[] = ['video', 'document']

const KIND_LABELS: Readonly<Record<AssetKind, string>> = {
  image: 'Photos',
  video: 'Videos',
  document: 'Documents',
}

export function labelForKind(kind: AssetKind): string {
  return KIND_LABELS[kind]
}
