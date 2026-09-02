import { UPLOADABLE_MIME_TYPES } from '@/lib/assets/kind'
import { MEDIA_UPLOAD_CAP_BYTES } from '@/lib/posts/media-constants'

/**
 * WHETHER A FILE SOMEBODY DROPPED CAN BE USED, AND WHAT TO SAY WHEN IT CANNOT.
 *
 * ── THE BROWSER'S GUESS IS NOT PROOF, AND THIS IS NOT THE GUARD ─────────────
 * `File.type` is whatever the operating system associated with the extension.
 * It can be wrong, absent, or a lie, so nothing here is a security check: the
 * server sniffs the actual bytes and refuses on what it PROVES. This function
 * exists to stop a person waiting through an upload of a video that was never
 * going to be accepted, which is a courtesy and not a gate.
 *
 * ── SO IT REFUSES ONLY WHAT IT IS SURE ABOUT ────────────────────────────────
 * An empty or unrecognised type is ACCEPTED here and left to the server. A
 * screen that refused everything it did not recognise would reject a valid JPEG
 * from an operating system that reported nothing, and the person would have no
 * way to tell that their file was fine.
 *
 * Pure: no I/O, no clock, no database.
 */

/** The cap, in whole megabytes, as the sentence states it. */
export const UPLOAD_CAP_MB = Math.floor(MEDIA_UPLOAD_CAP_BYTES / 1_000_000)

/**
 * Why this file cannot be used, or null when it can be tried.
 *
 * Every sentence names the fix, because a refusal a person cannot act on is a
 * dead end and this product forbids those.
 */
export function describeUploadRefusal(file: { type: string; size: number }): string | null {
  if (file.size === 0) {
    return 'That file is empty. Pick the picture again, or try a different one.'
  }

  if (file.size > MEDIA_UPLOAD_CAP_BYTES) {
    return `That picture is larger than ${UPLOAD_CAP_MB} MB, which is the most an upload can carry. Make it smaller and add it again.`
  }

  // Absent or unrecognised goes THROUGH. See this file's header: the server
  // decides on proven bytes, and refusing here on a blank guess would reject
  // valid pictures from systems that report nothing.
  if (file.type === '') return null
  if (UPLOADABLE_MIME_TYPES.includes(file.type)) return null
  if (!file.type.startsWith('image/')) {
    return 'Sahoda can only start from a picture. Pick a photo rather than a video or a document.'
  }

  return `Sahoda cannot read that kind of picture. A JPEG, a PNG or a WebP all work.`
}

/** What the file picker offers, from the engine's own list rather than a literal. */
export function uploadAccept(): string {
  return UPLOADABLE_MIME_TYPES.join(',')
}
