import type { ScanAttempt, ScanOutcome } from './types'

/** One row of `radar_fetch_log`, as `@sahoda/jobs/radar-log` projects it. */
export interface AttemptRow {
  competitorId: string
  outcome: string
  why: string | null
  fetchedAt: string
}

/**
 * The collector's four words into the screen's three.
 *
 * `changed` and `unchanged` both mean the page was READ, which is `observed`.
 * `could_not_check` is the gap the feed exists to show. `pending` is a row the
 * collector claimed and never finished (a crash mid-pass), and anything this
 * file has never heard of joins it as `not_attempted`: a word we do not know is
 * not a failure we may assert.
 */
export function scanOutcomeFor(outcome: string): ScanOutcome {
  if (outcome === 'changed' || outcome === 'unchanged') return 'observed'
  if (outcome === 'could_not_check') return 'unreachable'
  return 'not_attempted'
}

/**
 * The calendar day an attempt belongs to, in the workspace's zone.
 *
 * `en-CA` is the one locale whose default date is `YYYY-MM-DD`, which is the
 * shape `RadarChange.observedOn` already uses, so the two bucket together.
 * An unknown zone falls back to UTC rather than throwing the whole feed away.
 */
export function attemptDay(iso: string, timezone: string | null): string {
  const date = new Date(iso)
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone ?? 'UTC',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(date)
  } catch {
    return date.toISOString().slice(0, 10)
  }
}

/**
 * Rows into attempts, ONE PER COMPETITOR PER DAY, worst outcome kept.
 *
 * A competitor with three sources produces three rows a night. The feed's
 * question is "could Sahoda see this business today", so the day keeps a
 * single answer: unreachable beats observed beats not_attempted, because one
 * source that could not be read is a gap even when another was.
 */
export function toScanAttempts(
  rows: readonly AttemptRow[],
  timezone: string | null,
): ScanAttempt[] {
  const rank: Record<ScanOutcome, number> = { not_attempted: 0, observed: 1, unreachable: 2 }
  const byKey = new Map<string, ScanAttempt>()
  for (const row of rows) {
    const attemptedOn = attemptDay(row.fetchedAt, timezone)
    const outcome = scanOutcomeFor(row.outcome)
    const key = `${row.competitorId}|${attemptedOn}`
    const held = byKey.get(key)
    if (held && rank[held.outcome] >= rank[outcome]) continue
    byKey.set(key, {
      competitorId: row.competitorId,
      attemptedOn,
      outcome,
      note: outcome === 'unreachable' ? row.why : null,
    })
  }
  return [...byKey.values()]
}
