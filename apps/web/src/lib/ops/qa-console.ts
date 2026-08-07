import type { OpsQaRun } from '@sahoda/shared'

/**
 * The QA console's arithmetic (doc 13 §11). Pure — `now` is always passed in.
 */

export type DateWindow = 'today' | 'week' | 'all'

export interface QaFilters {
  taskCode: string | null
  suite: string | null
  status: string | null
  actor: string | null
  window: DateWindow
}

export const NO_QA_FILTERS: QaFilters = {
  taskCode: null,
  suite: null,
  status: null,
  actor: null,
  window: 'all',
}

/** A run's identity for "superseded" purposes: the same check on the same card. */
function laneOf(run: OpsQaRun): string {
  return `${run.task_code ?? '—'}::${run.suite}`
}

function startedAt(run: OpsQaRun): number {
  const parsed = Date.parse(run.started_at)
  return Number.isNaN(parsed) ? 0 : parsed
}

/**
 * Red runs that are still standing — doc 13 §11's "pins to the top until
 * resolved or superseded".
 *
 * SUPERSEDED means a NEWER run exists for the same card and suite, whatever it
 * said. A later pass clears the pin because the check was re-run and answered;
 * a later fail replaces the pin rather than stacking a second one. What does
 * NOT clear a pin is a pass in a DIFFERENT suite, or on a different card —
 * those are unrelated evidence, and letting them count would let a green unit
 * run bury a red rls run for the same card.
 *
 * Note this is deliberately not "status = fail": every failure is history, and
 * a console that pinned all of them would be a wall of resolved failures.
 */
export function standingFailures(runs: readonly OpsQaRun[]): OpsQaRun[] {
  const newestPerLane = new Map<string, OpsQaRun>()

  for (const run of runs) {
    const lane = laneOf(run)
    const seen = newestPerLane.get(lane)
    if (!seen || startedAt(run) > startedAt(seen)) newestPerLane.set(lane, run)
  }

  return [...newestPerLane.values()]
    .filter((run) => run.status === 'fail')
    .sort((a, b) => startedAt(b) - startedAt(a))
}

const WINDOW_MS: Record<Exclude<DateWindow, 'all'>, number> = {
  today: 24 * 60 * 60 * 1000,
  week: 7 * 24 * 60 * 60 * 1000,
}

export function applyQaFilters(
  runs: readonly OpsQaRun[],
  filters: QaFilters,
  now: Date,
): OpsQaRun[] {
  const cutoff = filters.window === 'all' ? null : now.getTime() - WINDOW_MS[filters.window]

  return runs.filter((run) => {
    if (filters.taskCode && run.task_code !== filters.taskCode) return false
    if (filters.suite && run.suite !== filters.suite) return false
    if (filters.status && run.status !== filters.status) return false
    if (filters.actor && run.actor !== filters.actor) return false
    if (cutoff !== null && startedAt(run) < cutoff) return false
    return true
  })
}

/**
 * The feed: standing failures pinned above, the rest newest-first below.
 *
 * A pinned run is REMOVED from the history below rather than shown twice. The
 * two sections are adjacent, so nothing is hidden by the split, and one run
 * appearing in two places invites the reader to count it twice.
 */
export interface Feed {
  pinned: OpsQaRun[]
  history: OpsQaRun[]
}

export function buildFeed(runs: readonly OpsQaRun[]): Feed {
  const pinned = standingFailures(runs)
  const pinnedIds = new Set(pinned.map((run) => run.id))

  return {
    pinned,
    history: [...runs]
      .filter((run) => !pinnedIds.has(run.id))
      .sort((a, b) => startedAt(b) - startedAt(a)),
  }
}

/** Distinct values present, for building filter controls that cannot be empty. */
export function facetsOf(runs: readonly OpsQaRun[]): {
  suites: string[]
  statuses: string[]
  actors: string[]
  taskCodes: string[]
} {
  const suites = new Set<string>()
  const statuses = new Set<string>()
  const actors = new Set<string>()
  const taskCodes = new Set<string>()

  for (const run of runs) {
    suites.add(run.suite)
    statuses.add(run.status)
    actors.add(run.actor)
    if (run.task_code) taskCodes.add(run.task_code)
  }

  return {
    suites: [...suites].sort(),
    statuses: [...statuses].sort(),
    actors: [...actors].sort(),
    taskCodes: [...taskCodes].sort(),
  }
}

/** `1.4 s` · `812 ms` · `2 min 5 s` — durations read at a glance, not in digits. */
export function formatDuration(ms: number | null): string | null {
  if (ms === null || ms < 0) return null
  if (ms < 1000) return `${ms} ms`
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)} s`

  const minutes = Math.floor(ms / 60_000)
  const seconds = Math.round((ms % 60_000) / 1000)
  return `${minutes} min ${seconds} s`
}
