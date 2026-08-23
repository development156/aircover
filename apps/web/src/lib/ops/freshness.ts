/**
 * How long ago the console last heard anything (SL-061, Tier 1). Pure — `now`
 * is always a parameter.
 *
 * ── WHY THIS IS COMPUTED FROM THE DATA AND NEVER REPORTED BY THE SYNCER ─────
 * On 1 Aug the deployed board sat 30 hours behind, showing 49 cards when the
 * repo held 60, and nothing on the page said so. The sync posts to whatever
 * `OPS_INGEST_URL` names, which defaulted to a developer's own machine — so
 * with no dev server running, the update was queued, the script printed "will
 * replay on the next sync" and exited SUCCESSFULLY. That promise is only kept
 * if a sync ever runs; for 30 hours none did.
 *
 * So the freshness figure MUST come from `max(updated_at)` across the ops
 * tables — the trace an update leaves behind — and never from a field the
 * syncer writes. A syncer that never runs cannot write "I never ran"; it would
 * report nothing wrong, which is the same bug wearing a badge that says fixed.
 *
 * The corollary matters as much: `null` (nothing has ever been written, or the
 * read failed) is NOT fresh. It renders as "unknown", loudly, because "we have
 * no idea how old this is" and "this is current" are opposite claims.
 */

export type FreshnessLevel = 'fresh' | 'ageing' | 'stale' | 'unknown'

export interface Freshness {
  level: FreshnessLevel
  /** Whole milliseconds since the newest write, or null when unknown. */
  ageMs: number | null
  /** "Last synced 4 hours ago" · "Last sync unknown". Ready to render. */
  label: string
}

/** doc SL-061: neutral under an hour, warn past six, crimson past a day. */
export const AGEING_AFTER_MS = 6 * 60 * 60 * 1000
export const STALE_AFTER_MS = 24 * 60 * 60 * 1000

function agoLabel(ms: number): string {
  const minutes = Math.floor(ms / 60_000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`

  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`

  const days = Math.floor(hours / 24)
  return `${days} day${days === 1 ? '' : 's'} ago`
}

export function freshnessOf(latestWrite: string | null, now: Date): Freshness {
  if (!latestWrite) {
    return {
      level: 'unknown',
      ageMs: null,
      label: 'Last sync unknown, so nothing on this page can be trusted to be current',
    }
  }

  const at = Date.parse(latestWrite)
  if (Number.isNaN(at)) {
    return { level: 'unknown', ageMs: null, label: 'Last sync unknown' }
  }

  // Clamped at zero: a row stamped slightly in the future (clock skew between
  // the database and this server) is "just now", never "-3 minutes ago".
  const ageMs = Math.max(0, now.getTime() - at)

  const level: FreshnessLevel =
    ageMs >= STALE_AFTER_MS ? 'stale' : ageMs >= AGEING_AFTER_MS ? 'ageing' : 'fresh'

  return { level, ageMs, label: `Last synced ${agoLabel(ageMs)}` }
}

/** The newest of several timestamps, ignoring nulls. Null when there are none. */
export function newestOf(timestamps: readonly (string | null)[]): string | null {
  let best: string | null = null
  let bestAt = Number.NEGATIVE_INFINITY

  for (const stamp of timestamps) {
    if (!stamp) continue
    const at = Date.parse(stamp)
    if (Number.isNaN(at) || at <= bestAt) continue
    best = stamp
    bestAt = at
  }
  return best
}
