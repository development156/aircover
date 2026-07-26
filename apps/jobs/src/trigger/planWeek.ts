import { task } from '@trigger.dev/sdk'
import { PlanWeekJobPayloadSchema, type PlanWeekJobPayload } from '@sahoda/shared'
import { runPlanWeekJob } from '../ai/plan-week-job'
import { planWeekDeps } from '../ai/deps'

export const PLAN_WEEK_TASK_ID = 'plan-week'

/**
 * "Plan my week" as a durable task — the seam apps/web's planner triggers.
 *
 * maxAttempts is 1 on purpose. The job charges credits, and withCredits derives its
 * attempt from (action, objectRef) with a ref minted fresh per invocation, so a
 * framework-level retry would mint a NEW ref and take a SECOND real charge for the same
 * request. Retrying is the user's decision, not the runner's.
 */
export const planWeekTask = task({
  id: PLAN_WEEK_TASK_ID,
  retry: { maxAttempts: 1 },
  run: async (payload: PlanWeekJobPayload) =>
    runPlanWeekJob(PlanWeekJobPayloadSchema.parse(payload), planWeekDeps()),
})

/** Enqueue a plan-week run for a workspace. */
export function triggerPlanWeek(payload: PlanWeekJobPayload) {
  return planWeekTask.trigger(payload)
}
