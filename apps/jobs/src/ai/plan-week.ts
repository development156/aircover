import { planWeekTask } from '@sahoda/mesh'
import type { Mesh, PlanWeekInput } from '@sahoda/mesh'
import type { MeshContext } from '@sahoda/shared'
import { getMesh } from './mesh'

/**
 * Background AI task: generate the week's 5 brand-grounded briefs — the "Plan my
 * week" v0 seed (Roadmap item 11). wt-jobs wraps this in a durable Trigger.dev task;
 * a server action may also call it directly. The Mesh is injectable for tests.
 *
 * Returns the frozen Result contract; callers map the briefs onto posts inserts and
 * charge via withCredits (loop_cycle) — this seam only runs the model.
 */
export function runPlanWeek(input: PlanWeekInput, ctx: MeshContext, mesh: Mesh = getMesh()) {
  return mesh.runTask(planWeekTask.def, input, ctx)
}
