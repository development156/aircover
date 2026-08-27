/**
 * WHAT TO SAY WHEN A PERSON UPLOADS A FILE THEY ALREADY HAVE.
 *
 * Pure, and out of `actions/assets.ts` on purpose: this is the whole
 * user-visible result of duplicate detection, and it has two claims in it that
 * are easy to get wrong and impossible to see wrong from inside a 500-line
 * server action.
 *
 * ── CLAIM ONE: "THE SAME FILE", NEVER "THE SAME PHOTO" ───────────────────────
 * The check is a SHA-256 of the exact bytes. Two visually identical photos saved
 * at different quality settings have different bytes and different hashes, so
 * "you already have this photo" would be a claim the mechanism cannot support —
 * and the person would believe Sahoda had looked at the picture. It looked at
 * the bytes. Perceptual similarity is a different feature and this is not it.
 *
 * ── CLAIM TWO: A TRASHED MATCH IS A DIFFERENT SITUATION ──────────────────────
 * "You already have this" is wrong when the file is in the trash: they deleted
 * it. And silently uploading a second copy would leave two rows and two objects
 * in storage for one file. So the trashed case says where it is and points at
 * the one action that costs nothing — Restore, which reuses bytes already paid
 * for.
 */

/** What a file with no title is called in a sentence. Never an id. */
const UNTITLED = 'an untitled photo'

export function duplicateMessage(title: string | null, deletedAt: string | null): string {
  const name = typeof title === 'string' && title.trim() !== '' ? title.trim() : UNTITLED

  if (deletedAt !== null) {
    return `This file is in your trash: ${name}. Restore it there rather than adding it again.`
  }
  return `You already have this file: ${name}. It was not added again.`
}
