import { DEFAULT_ZONE } from '@/lib/time/zone'

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
    return 'Sahoda could not read part of your workspace just now.'
  }

  const drafts = (counts.byStatus.draft ?? 0) + (counts.byStatus.idea ?? 0)
  // The same three intents `needsAPerson` puts in the queue directly under
  // this sentence (lib/approvals/queue.ts). MEASURED 2026-09-06: a workspace
  // whose only post was in review read "Nothing in flight yet" here and
  // "Waiting on you · 1 post" one line down, because this sentence counted
  // drafts and approvals and nothing between them.
  const review = counts.byStatus.review ?? 0
  const failed = (counts.byStatus.failed ?? 0) + (counts.byStatus.partial ?? 0)
  const approved = counts.byStatus.approved ?? 0
  const clauses: string[] = []

  // "in progress", not "waiting": the board 40px below owns the word
  // "Waiting on you", and a draft with no date is not waiting on anyone.
  if (drafts > 0) clauses.push(`${plural(drafts, 'draft', 'drafts')} you are still writing`)
  if (review > 0) clauses.push(`${plural(review, 'post', 'posts')} waiting for your OK`)
  // Not "ready to go": since `approve_posts` books a dated post as `scheduled`,
  // an `approved` row never carries a time, so nothing about it goes out until
  // someone gives it one. The clause says that instead of implying it will.
  if (approved > 0) {
    clauses.push(`${plural(approved, 'post', 'posts')} approved and waiting for a time`)
  }
  // The composer's Confirm schedule writes `scheduled` (MEASURED 2026-09-06),
  // and the board counts it as committed; this sentence must not say "nothing
  // in flight" over a "Scheduled · 1 post" cell.
  const scheduled = (counts.byStatus.scheduled ?? 0) + (counts.byStatus.publishing ?? 0)
  if (scheduled > 0) clauses.push(`${plural(scheduled, 'post', 'posts')} set to go out`)
  // Only a SUCCEEDED live publish counts as "out". A fixture run is simulated
  // and saying it went out would be the fabricated success state the whole
  // product rule forbids.
  if (publish.live > 0) clauses.push(`${plural(publish.live, 'post', 'posts')} went out`)
  // A partly published post is a failure to the reader: something they
  // approved did not all go out, and the queue below files it as one.
  if (failed > 0) clauses.push(`${plural(failed, 'post', 'posts')} could not go out`)

  if (clauses.length === 0) {
    return 'Nothing is happening yet. Plan a week and this fills in.'
  }

  return `${clauses.join(', ')}.`
}

/**
 * Time-of-day greeting in the workspace's own zone.
 *
 * `zone` is whatever `resolveDisplayZone(workspace.timezone)` answered, and
 * defaults to IST for the callers that render before a workspace exists.
 * "Good morning" at 11pm is a small lie, and it was the first sentence on the
 * screen for any workspace that had set a timezone other than Asia/Kolkata.
 */
export function greetingFor(now: Date, zone: string = DEFAULT_ZONE): string {
  const hour = Number(
    new Intl.DateTimeFormat('en-IN', {
      timeZone: zone,
      hour: 'numeric',
      hour12: false,
    }).format(now),
  )
  if (hour < 12) return 'Good morning'
  if (hour < 17) return 'Good afternoon'
  return 'Good evening'
}
