import type { AssetUsageSite } from './delete-gate'
import { nameOfPost } from './delete-gate'

/**
 * WHAT MOVING A FILE TO THE TRASH ACTUALLY DOES, SAID IN ONE SENTENCE.
 *
 * ── WHY THIS IS NOT A SECOND DELETE GATE ─────────────────────────────────────
 * `decideAssetDelete` refuses, and it is right to: deleting a file cascades
 * `asset_usages`, so a scheduled post loses its photo with nobody told. Trashing
 * cascades NOTHING. The row stays, every attachment stays, the bytes stay in the
 * bucket. A published post that uses a trashed file keeps working, byte for
 * byte, because nothing about it changed.
 *
 * So there is no data-loss path here to guard, and a function that refused would
 * be inventing a refusal the mechanism does not need. This one never refuses,
 * and it is called `describeTrash` rather than `decideTrash` for exactly that
 * reason — a name that promised a decision would be the first thing to mislead
 * whoever reads the call site.
 *
 * ── WHAT IT DOES INSTEAD, AND WHY THAT MATTERS MORE ──────────────────────────
 * It names the trap. A person trashes a photo, watches it vanish from the
 * library, and reasonably concludes their scheduled post no longer has it. That
 * conclusion is WRONG, and nothing else on the screen would correct it. So when
 * posts still use the file, the sentence says both halves: they keep it, and the
 * trash is a hide rather than a removal.
 *
 * The real gate runs later and unchanged. "Delete for good" is `delete_asset`,
 * which re-reads usage at the moment it is pressed rather than trusting whatever
 * was true whenever the file was trashed.
 *
 * Pure: no I/O, no clock, no database.
 */

export interface TrashDescription {
  /**
   * Posts that go on using the file while it sits in the trash. Empty is the
   * ordinary case and produces no message at all.
   */
  stillUsed: AssetUsageSite[]
  /** The sentence, or null when there is genuinely nothing to say. */
  message: string | null
}

/** At most this many posts are named before the rest are counted. */
const MAX_NAMED = 3

function listNames(sites: readonly AssetUsageSite[]): string {
  const named = sites.slice(0, MAX_NAMED).map(nameOfPost)
  const hidden = sites.length - named.length
  if (hidden > 0) named.push(hidden === 1 ? '1 more post' : `${hidden} more posts`)
  if (named.length === 1) return named[0] as string
  const last = named[named.length - 1] as string
  return `${named.slice(0, -1).join(', ')} and ${last}`
}

/**
 * Say what trashing this file will and will not do, given every post that uses
 * it.
 *
 * An empty list returns a null message rather than a reassuring one. "No posts
 * use this file" is a sentence nobody needs before an action that is already
 * reversible, and a screen that prints something for every case trains people
 * to stop reading it.
 */
export function describeTrash(sites: readonly AssetUsageSite[]): TrashDescription {
  const stillUsed = Array.isArray(sites) ? [...sites] : []
  if (stillUsed.length === 0) return { stillUsed: [], message: null }

  const count = stillUsed.length === 1 ? '1 post' : `${stillUsed.length} posts`
  const they = stillUsed.length === 1 ? 'That post keeps' : 'Those posts keep'
  return {
    stillUsed,
    message: `${count} still uses this file: ${listNames(stillUsed)}. ${they} it. The trash hides a file from your library, it does not take it off a post.`,
  }
}

/**
 * How a file's time in the trash is described.
 *
 * Returns null when `deletedAt` is not a timestamp this can read, and the screen
 * prints the absence mark rather than a guess. "Deleted today" for a row whose
 * column came back malformed is a figure no query produced.
 *
 * `now` is passed in rather than read from the clock, so the same call gives the
 * same answer in a test as it does on the screen.
 */
export function trashedAgo(deletedAt: string | null, now: Date): string | null {
  if (typeof deletedAt !== 'string' || deletedAt === '') return null
  const then = Date.parse(deletedAt)
  if (!Number.isFinite(then)) return null

  const days = Math.floor((now.getTime() - then) / 86_400_000)
  // A negative gap means the row's timestamp is ahead of this clock — a skew
  // between the database and the browser, not a file deleted in the future. It
  // reads as today, which is the closest true thing to say.
  if (days <= 0) return 'Deleted today'
  if (days === 1) return 'Deleted yesterday'
  if (days < 30) return `Deleted ${days} days ago`
  const months = Math.floor(days / 30)
  return months === 1 ? 'Deleted 1 month ago' : `Deleted ${months} months ago`
}
