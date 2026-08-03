import type { OpsTask } from '@sahoda/shared'

import { cardHeadline } from '@/lib/ops/card-copy'

/**
 * The arithmetic behind the hero card (SL-062 §1). Pure — `now` is a parameter.
 *
 * DELIBERATELY ABSENT: velocity, burndown, and raw test counts. Each of them
 * moves for reasons that have nothing to do with the work, and a stakeholder
 * reading "23 tests added" concludes something about quality that the number
 * cannot support. What is here is what a person would ask out loud: what
 * shipped, what is stuck, what is next.
 */

export const SHIPPED_WINDOW_DAYS = 7

export interface HeroCard {
  code: string
  /** The plain-English first sentence — never the technical half. */
  headline: string
  reason: string | null
}

function toHero(task: OpsTask): HeroCard {
  return {
    code: task.code,
    headline: cardHeadline(task.detail, task.title),
    reason: task.blocked_reason,
  }
}

/**
 * What shipped in the last week — cards that reached Done, newest first.
 *
 * Read from `done_at` AND `board_column`, not from `done_at` alone. SL-036
 * records that a card moved backward keeps a `done_at` it no longer deserves,
 * so a card sitting in For Review with an old Done stamp would otherwise be
 * announced as shipped. When the two disagree, the column wins: it is the
 * current fact, and the stamp is the stale one.
 */
export function shippedThisWeek(tasks: readonly OpsTask[], now: Date): HeroCard[] {
  const since = now.getTime() - SHIPPED_WINDOW_DAYS * 86_400_000

  return tasks
    .filter((task) => {
      if (task.board_column !== 'done' || !task.done_at) return false
      const at = Date.parse(task.done_at)
      return !Number.isNaN(at) && at >= since && at <= now.getTime()
    })
    .sort((a, b) => Date.parse(b.done_at!) - Date.parse(a.done_at!))
    .map(toHero)
}

/**
 * What is blocked, and why — in board order, with the reason attached.
 *
 * A blocked card with no reason is INCLUDED, carrying null. Dropping it would
 * make the honest-but-unexplained case invisible, which is the opposite of what
 * a blocker list is for; the card component says so in words instead.
 */
export function blockedNow(tasks: readonly OpsTask[]): HeroCard[] {
  return tasks.filter((task) => task.blocked).map(toHero)
}

/**
 * What is next — cards in flight first, then the top of To Do.
 *
 * Bounded to `limit`, and the caller is told the total so it can say "and N
 * more" rather than quietly truncating. A capped list that does not admit its
 * cap reads as a complete list.
 */
export function whatsNext(
  tasks: readonly OpsTask[],
  limit = 4,
): { next: HeroCard[]; remaining: number } {
  const inFlight = tasks.filter((task) => task.board_column === 'in_progress' && !task.blocked)
  const queued = tasks.filter((task) => task.board_column === 'todo' && !task.blocked)
  const ordered = [...inFlight, ...queued]

  return {
    next: ordered.slice(0, limit).map(toHero),
    remaining: Math.max(0, ordered.length - limit),
  }
}
