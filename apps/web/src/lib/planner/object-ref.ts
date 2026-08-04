import { randomUUID } from 'node:crypto'

/**
 * Fresh ref for one `loop_cycle` charge (20 credits). **Server-derived only**,
 * fresh per invocation — `withCredits` keys exactly-once on `(action,
 * objectRef)` and REUSES a DEBIT-settled attempt, so a stable ref would replay
 * the spent charge (free generation) while still running the paid model call.
 * Mirrors `lib/posts/object-ref.ts`, where the full reasoning lives.
 */
export function newPlanWeekRef(workspaceId: string): string {
  return `${workspaceId}:plan_week:${randomUUID()}`
}
