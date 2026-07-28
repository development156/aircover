import type { OpsQaRun, OpsTask } from '@sahoda/shared'

/**
 * The scrum board's arithmetic (doc 13 §10). Pure — `now` is always passed in.
 */

export const COLUMNS = ['todo', 'in_progress', 'review', 'done'] as const
export type Column = (typeof COLUMNS)[number]

export const COLUMN_LABEL: Record<Column, string> = {
  todo: 'To Do',
  in_progress: 'In Progress',
  review: 'For Review',
  done: 'Done',
}

/** doc 13 §10: a nudge, never a block. Five is a suggestion, not a rule. */
export const WIP_NUDGE_AT = 5

/** green · red · none — the dot on a card (§10). */
export type QaDot = 'pass' | 'fail' | 'none'

export interface BoardCard {
  code: string
  title: string
  detail: string | null
  roadmapCode: string | null
  assignee: string
  column: Column
  blocked: boolean
  blockedReason: string | null
  commitSha: string | null
  prRef: string | null
  qa: QaDot
  /** Milliseconds in the current column, or null when we cannot tell. */
  ageMs: number | null
  movedBy: string
}

/**
 * When the card entered the column it is in now.
 *
 * DERIVED, and imperfectly: the lifecycle stamps are only ever coalesced by
 * ops_ingest, so a card moved BACKWARD keeps a stamp it no longer deserves
 * (SL-036). That makes an age here optimistic in exactly one direction, which
 * is why `null` is returned rather than a fallback whenever the stamp for the
 * current column is missing. An age of "0 min" on a week-old card would be a
 * confident wrong answer; no age is an honest one.
 */
export function columnEnteredAt(task: OpsTask): string | null {
  switch (task.board_column) {
    case 'done':
      return task.done_at
    case 'review':
      return task.review_at
    case 'in_progress':
      return task.started_at
    case 'todo':
      return task.created_at
    default:
      return null
  }
}

/**
 * The newest QA verdict per task code.
 *
 * `blocked` and `running` are not verdicts and deliberately do not set the dot:
 * a card mid-run has not passed, and showing green would be a claim nobody made.
 */
export function qaByTask(runs: readonly OpsQaRun[]): Map<string, QaDot> {
  const seen = new Map<string, QaDot>()
  const newestFirst = [...runs].sort((a, b) => Date.parse(b.started_at) - Date.parse(a.started_at))

  for (const run of newestFirst) {
    if (!run.task_code || seen.has(run.task_code)) continue
    if (run.status === 'pass' || run.status === 'fail') seen.set(run.task_code, run.status)
  }
  return seen
}

export function toCards(
  tasks: readonly OpsTask[],
  runs: readonly OpsQaRun[],
  now: Date,
): BoardCard[] {
  const qa = qaByTask(runs)

  return tasks.map((task) => {
    const enteredAt = columnEnteredAt(task)
    const entered = enteredAt ? Date.parse(enteredAt) : NaN

    return {
      code: task.code,
      title: task.title,
      detail: task.detail,
      roadmapCode: task.roadmap_code,
      assignee: task.assignee,
      column: task.board_column as Column,
      blocked: task.blocked,
      blockedReason: task.blocked_reason,
      commitSha: task.commit_sha,
      prRef: task.pr_ref,
      qa: qa.get(task.code) ?? 'none',
      ageMs: Number.isNaN(entered) ? null : Math.max(0, now.getTime() - entered),
      movedBy: task.moved_by,
    }
  })
}

export interface BoardFilters {
  assignee: string | null
  stage: string | null
  blockedOnly: boolean
}

export const NO_FILTERS: BoardFilters = { assignee: null, stage: null, blockedOnly: false }

/**
 * `stage` filters on the roadmap code's PREFIX (`AO` matches AO1…AO5), because
 * a card links to an item, not to a stage, and the stage is what a person
 * thinks in. Cards with no roadmap code are technical debt found mid-build;
 * they match only when no stage filter is set, since they belong to no stage
 * and pretending otherwise would file them under whichever one is selected.
 */
export function applyFilters(cards: readonly BoardCard[], filters: BoardFilters): BoardCard[] {
  return cards.filter((card) => {
    if (filters.blockedOnly && !card.blocked) return false
    if (filters.assignee && card.assignee !== filters.assignee) return false
    if (filters.stage) {
      if (!card.roadmapCode) return false
      if (!card.roadmapCode.startsWith(filters.stage)) return false
    }
    return true
  })
}

export function groupByColumn(cards: readonly BoardCard[]): Record<Column, BoardCard[]> {
  const grouped = Object.fromEntries(
    COLUMNS.map((column) => [column, [] as BoardCard[]]),
  ) as Record<Column, BoardCard[]>

  for (const card of cards) {
    if (card.column in grouped) grouped[card.column].push(card)
  }
  return grouped
}

/** "4 min" · "3 h" · "2 days" — the compact form the card shows beside its code. */
export function shortAge(ms: number | null): string | null {
  if (ms === null) return null

  const minutes = Math.floor(ms / 60_000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes} min`

  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} h`

  const days = Math.floor(hours / 24)
  return `${days} ${days === 1 ? 'day' : 'days'}`
}

/** The distinct roadmap stage prefixes present on the board, for the filter. */
export function stagesOn(cards: readonly BoardCard[]): string[] {
  const prefixes = new Set<string>()
  for (const card of cards) {
    const match = /^([A-Za-z]+)/.exec(card.roadmapCode ?? '')
    if (match) prefixes.add(match[1]!)
  }
  return [...prefixes].sort()
}
