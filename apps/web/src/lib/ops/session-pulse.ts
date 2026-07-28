import type { OpsQaRun, OpsSession } from '@sahoda/shared'

/**
 * The header strips' arithmetic (doc 13 §12). Pure — `now` is always passed in.
 */

/**
 * A heartbeat older than this is not a live session, whatever its status says.
 *
 * doc 13 §12 fixes it at two minutes. The status column alone cannot be
 * trusted: a session that crashes, or a laptop that sleeps, leaves `working`
 * written in the row forever. A pulse that keeps beating for a process that
 * died is the dashboard equivalent of a green test that never ran.
 */
export const HEARTBEAT_WINDOW_MS = 2 * 60 * 1000

export type Pulse =
  | { state: 'working'; label: string; tasks: readonly string[]; since: string }
  | { state: 'idle'; since: string | null }
  | { state: 'never' }

function heartbeatOf(session: OpsSession): number {
  const parsed = Date.parse(session.last_heartbeat_at)
  return Number.isNaN(parsed) ? 0 : parsed
}

/**
 * Is anything working right now?
 *
 * `working` requires BOTH the status and a heartbeat inside the window. Idle
 * reports the last heartbeat from any session, which is the honest answer to
 * "when did something last happen here" even if that session ended.
 */
export function pulseOf(sessions: readonly OpsSession[], now: Date): Pulse {
  if (sessions.length === 0) return { state: 'never' }

  const cutoff = now.getTime() - HEARTBEAT_WINDOW_MS
  const live = sessions
    .filter((session) => session.status === 'working' && heartbeatOf(session) >= cutoff)
    .sort((a, b) => heartbeatOf(b) - heartbeatOf(a))[0]

  if (live) {
    return {
      state: 'working',
      label: live.label ?? live.session_id,
      tasks: live.tasks_touched,
      since: live.last_heartbeat_at,
    }
  }

  const latest = [...sessions].sort((a, b) => heartbeatOf(b) - heartbeatOf(a))[0]
  return { state: 'idle', since: latest?.last_heartbeat_at ?? null }
}

export type ChipState = 'pass' | 'fail' | 'running' | 'blocked' | 'never'

export interface GateChip {
  suite: string
  state: ChipState
  /** ISO timestamp of the run behind this chip, or null when it never ran. */
  at: string | null
}

/**
 * One chip per suite. A suite that has never run is `never`, NOT green.
 *
 * This is the whole point of the strip: "we have no evidence" and "it passed"
 * are different claims, and only one of them is safe to act on. doc 13 §12 also
 * shows age beside each chip so a stale pass cannot pose as a fresh one.
 */
export function gateChips(
  suites: readonly string[],
  latest: Readonly<Record<string, OpsQaRun | null>>,
): GateChip[] {
  return suites.map((suite) => {
    const run = latest[suite] ?? null
    if (!run) return { suite, state: 'never', at: null }
    return { suite, state: run.status as ChipState, at: run.finished_at ?? run.started_at }
  })
}

/** Suites whose newest run failed — what D1's "To reach Done" lists (§7). */
export function redSuitesFrom(chips: readonly GateChip[]): string[] {
  return chips.filter((chip) => chip.state === 'fail').map((chip) => chip.suite)
}

/**
 * "just now" · "4 min ago" · "3 h ago" · "2 days ago".
 *
 * Coarse on purpose. A dashboard that renders "1 min 42 s ago" invites the
 * reader to treat a rounded number as a precise one.
 */
export function relativeAge(at: string | null, now: Date): string | null {
  if (!at) return null
  const then = Date.parse(at)
  if (Number.isNaN(then)) return null

  const seconds = Math.max(0, Math.round((now.getTime() - then) / 1000))
  if (seconds < 45) return 'just now'

  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes} min ago`

  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours} h ago`

  const days = Math.round(hours / 24)
  return `${days} ${days === 1 ? 'day' : 'days'} ago`
}

/**
 * `24 Jul 2026 · 14:32` in IST — the format doc 13 §8 fixes for every timestamp
 * in this console. The team is in one timezone; rendering UTC would make every
 * reader do arithmetic to answer "was that before or after lunch".
 */
export function formatIst(at: string | null): string | null {
  if (!at) return null
  const date = new Date(at)
  if (Number.isNaN(date.getTime())) return null

  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date)

  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? ''

  return `${get('day')} ${get('month')} ${get('year')} · ${get('hour')}:${get('minute')}`
}
