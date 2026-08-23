import type { PostCounts } from './posts'
import type { PublishSummary } from './publishing'

/**
 * One sentence of real state, under the greeting.
 *
 * Every clause is a count that came from a table. There is no filler: if there
 * is nothing true to say, this returns the invitation instead of padding the
 * line with zeroes. "0 drafts, 0 posts out, 0 credits spent" is technically
 * accurate and reads as a broken dashboard; saying nothing yet reads as a new
 * one, which is what it is.
 *
 * `unreadable` is never dressed up as zero — a read that failed says so, because
 * "you have no drafts" and "we could not count your drafts" are different
 * claims.
 */

/** Pluralise without inventing an Intl dependency for two words. */
const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`

export function greetingState(counts: PostCounts, publish: PublishSummary): string {
  if (counts.status === 'unreadable' || publish.status === 'unreadable') {
    return "Some of your workspace couldn't be read just now."
  }

  const drafts = (counts.byStatus.draft ?? 0) + (counts.byStatus.idea ?? 0)
  const approved = counts.byStatus.approved ?? 0
  const clauses: string[] = []

  if (drafts > 0) clauses.push(`${plural(drafts, 'draft', 'drafts')} waiting`)
  if (approved > 0) clauses.push(`${plural(approved, 'post', 'posts')} approved`)
  // Only a SUCCEEDED live publish counts as "out". A fixture run is simulated
  // and saying it went out would be the fabricated success state the whole
  // product rule forbids.
  if (publish.live > 0) clauses.push(`${plural(publish.live, 'post', 'posts')} out`)

  if (clauses.length === 0) {
    return 'Nothing in flight yet. Plan a week and it starts filling in.'
  }

  return `${clauses.join(', ')}.`
}

/** Time-of-day greeting in IST, where the workspaces are. */
export function greetingFor(now: Date): string {
  const hour = Number(
    new Intl.DateTimeFormat('en-IN', {
      timeZone: 'Asia/Kolkata',
      hour: 'numeric',
      hour12: false,
    }).format(now),
  )
  if (hour < 12) return 'Good morning'
  if (hour < 17) return 'Good afternoon'
  return 'Good evening'
}
