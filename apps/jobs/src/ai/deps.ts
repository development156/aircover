import { createWithCredits } from '@sahoda/billing'
import { getRuntime } from '../runtime'
import { createPostsStore } from './postsStore'
import { runPlanWeek } from './plan-week'
import type { PlanWeekJobDeps } from './plan-week-job'

/** Dependencies for one plan-week run. */
export function planWeekDeps(): PlanWeekJobDeps {
  const { pool, ledger } = getRuntime()
  const posts = createPostsStore({ pool })
  return {
    withCredits: createWithCredits(ledger),
    runPlanWeek: (input, ctx) => runPlanWeek(input, ctx),
    insertBriefs: posts.insertBriefs,
  }
}
