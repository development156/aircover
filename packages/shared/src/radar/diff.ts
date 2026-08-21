import type { RadarSnapshotPayload, PricePoint } from './snapshot'

/**
 * RADAR — what moved between two snapshots.
 *
 * ── THE THREE RULES THIS FILE ENFORCES ───────────────────────────────────────
 *
 * 1. A CHANGE IS DERIVED, NEVER ASSERTED. Everything here is a pure comparison of
 *    two payloads. Nothing reaches a model, nothing reads the network, and no
 *    text that came off a competitor's page can cause a change to be reported.
 *    That last point is the security property: a rival's page can contain a
 *    sentence addressed to whatever machine is reading it — this codebase has met
 *    a real one on a live crawl — and the decision that something changed is made
 *    by `!==` on numbers and set arithmetic on ids, which cannot be persuaded.
 *
 * 2. ABSENT IS NOT ZERO, AND ABSENT IS NOT A CHANGE. If a follower count is in
 *    yesterday's snapshot and missing from today's, the platform declined to say
 *    — which is not the same fact as "the number moved", and reporting it as a
 *    fall to zero would be Radar inventing a collapse.
 *
 * 3. A GAP IS CARRIED, NOT HIDDEN. Two snapshots four days apart describe four
 *    days. `daySpan` travels with every change so the screen can say "over four
 *    days" instead of "today" — otherwise a fetch resuming after an outage
 *    manufactures a burst of activity on the day service returns. The database
 *    recomputes this from the snapshots' own dates and overwrites whatever is
 *    supplied here, so the two can never disagree.
 */

export type RadarChangeKind = 'new_posts' | 'audience_moved' | 'page_content'

export interface RadarChangeDraft {
  changeKind: RadarChangeKind
  /** Sealed by the database from the two snapshots. Advisory here. */
  daySpan: number
  summary: string
  detail: Record<string, unknown>
}

export interface SnapshotForDiff {
  id: string
  capturedOn: string // YYYY-MM-DD
  payload: RadarSnapshotPayload
}

const DAY_MS = 86_400_000

export function daySpanBetween(fromCapturedOn: string, toCapturedOn: string): number {
  const a = Date.parse(`${fromCapturedOn}T00:00:00Z`)
  const b = Date.parse(`${toCapturedOn}T00:00:00Z`)
  return Math.max(1, Math.round((b - a) / DAY_MS))
}

/** "over the last 4 days" / "" for a normal consecutive pair. */
function spanPhrase(days: number): string {
  return days <= 1 ? '' : ` over the last ${days} days`
}

function formatCount(n: number): string {
  return n.toLocaleString('en-IN')
}

function priceKey(p: PricePoint): string {
  return `${p.currency}:${p.amount}`
}

/**
 * Everything that changed between two snapshots of the SAME source.
 *
 * Returns an empty array when nothing moved — which is the common case and the
 * whole reason Radar is affordable. An empty result means "we looked and nothing
 * happened"; it must never be produced for a day we failed to look at, and it
 * cannot be, because a failed check writes no snapshot for the differ to read.
 */
export function diffSnapshots(from: SnapshotForDiff, to: SnapshotForDiff): RadarChangeDraft[] {
  const daySpan = daySpanBetween(from.capturedOn, to.capturedOn)
  const changes: RadarChangeDraft[] = []

  if (from.payload.kind === 'social' && to.payload.kind === 'social') {
    // ── new posts ─────────────────────────────────────────────────────────────
    // Set arithmetic on platform ids, one direction only. A post in `from` and
    // not in `to` is NOT reported as a deletion: the provider returns the latest
    // dozen, so an older post falling off the end is the normal case and calling
    // it "they deleted a post" would be wrong nearly every time.
    const known = new Set(from.payload.posts.map((p) => p.id))
    const fresh = to.payload.posts.filter((p) => !known.has(p.id))
    if (fresh.length > 0) {
      changes.push({
        changeKind: 'new_posts',
        daySpan,
        summary: `Posted ${fresh.length} ${fresh.length === 1 ? 'time' : 'times'}${spanPhrase(daySpan)}.`,
        detail: {
          count: fresh.length,
          postIds: fresh.map((p) => p.id),
          // Captions ride along as EVIDENCE for the screen. They are a
          // competitor's own words, quoted; nothing downstream may treat them as
          // an instruction. See packages/shared/src/radar/evidence.ts.
          posts: fresh.map((p) => ({
            id: p.id,
            url: p.url,
            postedAt: p.postedAt,
            caption: p.caption,
          })),
        },
      })
    }

    // ── the audience number ───────────────────────────────────────────────────
    // BOTH sides must be present. `undefined` on either side means the platform
    // did not say, on one day or the other, and there is no movement to report.
    const before = from.payload.followers
    const after = to.payload.followers
    if (before !== undefined && after !== undefined && before !== after) {
      const delta = after - before
      changes.push({
        changeKind: 'audience_moved',
        daySpan,
        summary:
          `Followers ${delta > 0 ? 'up' : 'down'} ${formatCount(Math.abs(delta))}` +
          `${spanPhrase(daySpan)}, to ${formatCount(after)}.`,
        detail: { from: before, to: after, delta },
      })
    }
  }

  if (from.payload.kind === 'website' && to.payload.kind === 'website') {
    const priceBefore = new Map(from.payload.prices.map((p) => [priceKey(p), p]))
    const priceAfter = new Map(to.payload.prices.map((p) => [priceKey(p), p]))
    const added = [...priceAfter.values()].filter((p) => !priceBefore.has(priceKey(p)))
    const removed = [...priceBefore.values()].filter((p) => !priceAfter.has(priceKey(p)))
    const titleChanged = from.payload.title !== to.payload.title
    const wordDelta = to.payload.wordCount - from.payload.wordCount

    if (added.length > 0 || removed.length > 0 || titleChanged || wordDelta !== 0) {
      // ONE sentence, built from what actually differs, in the order a founder
      // would care about it: money first.
      const parts: string[] = []
      if (added.length > 0 || removed.length > 0) {
        parts.push(
          `prices changed (${added.length} new, ${removed.length} gone` +
            `${added.length > 0 ? `, now showing ${added[0]!.raw}` : ''})`,
        )
      }
      if (titleChanged) parts.push('the page title changed')
      if (wordDelta !== 0) {
        parts.push(`${wordDelta > 0 ? 'added' : 'removed'} ${Math.abs(wordDelta)} words`)
      }
      changes.push({
        changeKind: 'page_content',
        daySpan,
        summary: `Their page ${parts.join(', ')}${spanPhrase(daySpan)}.`,
        detail: {
          pricesAdded: added,
          pricesRemoved: removed,
          titleFrom: from.payload.title,
          titleTo: to.payload.title,
          wordDelta,
        },
      })
    }
  }

  return changes
}
