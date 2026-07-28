import type { OpsTask } from '@sahoda/shared'

/**
 * Cumulative flow, reconstructed from `ops_tasks` timestamps (doc 13, SL-042).
 *
 * There is no history table. Each task carries `created_at`, `started_at`,
 * `review_at` and `done_at`, and those four stamps are enough to say which
 * column a task was in on any given day — so the chart is derived, not stored.
 *
 * WHAT THIS CANNOT SEE, stated because a chart that hides its blind spot is
 * worse than no chart: `ops_task_move` CLEARS a stamp the new column does not
 * justify (SL-036). A card that reached Done and moved back to In Progress has
 * no surviving record of the days it spent in Done, so this reconstruction
 * shows it as though it had never got there. The series is therefore a lower
 * bound on progress, never an inflated one — which is the safe direction, and
 * `FLOW_CAVEAT` says so on the chart.
 */

export const FLOW_CAVEAT =
  'Rebuilt from each task’s current timestamps. A card that moved backwards loses the record of time it spent ahead, so this under-reports rather than over-reports.'

/** Doc 13 §11's rule, applied to every series here. */
export const MIN_POINTS_FOR_TREND = 5

export type FlowStage = 'todo' | 'in_progress' | 'review' | 'done'

/** Stacked bottom-first: Done is the foundation that accumulates. */
export const FLOW_STAGES: readonly FlowStage[] = ['done', 'review', 'in_progress', 'todo']

export const FLOW_STAGE_LABEL: Record<FlowStage, string> = {
  todo: 'To Do',
  in_progress: 'In Progress',
  review: 'For Review',
  done: 'Done',
}

export interface FlowDay {
  /** ISO date, `YYYY-MM-DD`. */
  day: string
  counts: Record<FlowStage, number>
  total: number
}

export interface FlowHistory {
  days: readonly FlowDay[]
  /** Said out loud on the chart rather than implied by the axis. */
  windowLabel: string
  /** Below this, points are drawn but no line is joined through them. */
  enoughForTrend: boolean
}

function dayKey(iso: string): string {
  return iso.slice(0, 10)
}

/** End of the given day, so a stamp anywhere in that day counts as reached. */
function endOfDay(day: string): number {
  return Date.parse(`${day}T23:59:59.999Z`)
}

function at(stamp: string | null): number | null {
  if (stamp === null) return null
  const value = Date.parse(stamp)
  return Number.isNaN(value) ? null : value
}

/**
 * Which column a task was in at the end of `day`, or null if it did not exist
 * yet. Checked newest-stage-first, because the stamps are cumulative.
 */
export function stageOn(task: OpsTask, dayEnd: number): FlowStage | null {
  const created = at(task.created_at)
  if (created === null || created > dayEnd) return null

  const done = at(task.done_at)
  if (done !== null && done <= dayEnd) return 'done'

  const review = at(task.review_at)
  if (review !== null && review <= dayEnd) return 'review'

  const started = at(task.started_at)
  if (started !== null && started <= dayEnd) return 'in_progress'

  return 'todo'
}

/** Every ISO day from `from` to `to` inclusive. */
function daysBetween(from: string, to: string): string[] {
  const out: string[] = []
  for (
    let t = Date.parse(`${from}T00:00:00Z`);
    t <= Date.parse(`${to}T00:00:00Z`);
    t += 86_400_000
  ) {
    out.push(new Date(t).toISOString().slice(0, 10))
  }
  return out
}

/**
 * Build the series.
 *
 * The window starts at the FIRST task rather than a fixed number of days back,
 * so the chart never opens with a run of empty days that look like a period of
 * no work. If the caller asks for more days than exist, it gets the days that
 * exist and a label that says so.
 */
export function buildFlowHistory(tasks: readonly OpsTask[], now: Date, maxDays = 30): FlowHistory {
  const today = now.toISOString().slice(0, 10)

  const created = tasks
    .map((task) => at(task.created_at))
    .filter((value): value is number => value !== null)

  if (created.length === 0) {
    return { days: [], windowLabel: 'No tasks yet', enoughForTrend: false }
  }

  const earliest = dayKey(new Date(Math.min(...created)).toISOString())
  const cap = dayKey(
    new Date(Date.parse(`${today}T00:00:00Z`) - (maxDays - 1) * 86_400_000).toISOString(),
  )
  const from = earliest > cap ? earliest : cap

  const days = daysBetween(from, today).map((day) => {
    const dayEnd = endOfDay(day)
    const counts: Record<FlowStage, number> = { todo: 0, in_progress: 0, review: 0, done: 0 }

    for (const task of tasks) {
      const stage = stageOn(task, dayEnd)
      if (stage !== null) counts[stage] += 1
    }

    return { day, counts, total: counts.todo + counts.in_progress + counts.review + counts.done }
  })

  return {
    days,
    windowLabel:
      days.length === 1
        ? 'Today only — one day of history'
        : `${days.length} days · ${from} to ${today}`,
    enoughForTrend: days.length >= MIN_POINTS_FOR_TREND,
  }
}
