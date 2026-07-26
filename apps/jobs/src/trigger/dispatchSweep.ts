import { schedules } from '@trigger.dev/sdk'
import { runDispatchSweep, type DispatchSweepReport } from '../dispatch/sweep'
import { dispatchSweepDeps } from '../runtime'
import { triggerPublishPost } from './publishPost'

export const DISPATCH_SWEEP_TASK_ID = 'dispatch-sweep'

/**
 * The scheduled-publish dispatcher, on the same 5-minute cadence as the hold sweep. A thin
 * wrapper: all behaviour lives in runDispatchSweep.
 *
 * SHIPS DARK. `SAHODA_PUBLISH_DISPATCH_MODE` defaults to `off`, so deploying this task
 * changes nothing until someone sets the flag deliberately.
 *
 * The enqueue is wired here rather than in `runtime.ts` on purpose. publishPost's trigger
 * helper already imports the runtime's pool, so building it there would
 * close a require cycle between the two modules — and it would pull the Trigger.dev SDK
 * into the layer the SDK-free cores share.
 *
 * Overlap is safe if a sweep runs long: candidates are re-read each run, and a repeat
 * enqueue collapses onto the same `${postId}:${channel}:${scheduledAt}` idempotency key
 * rather than posting twice.
 */
export const dispatchSweepTask = schedules.task({
  id: DISPATCH_SWEEP_TASK_ID,
  cron: '*/5 * * * *',
  run: async (): Promise<DispatchSweepReport> =>
    runDispatchSweep({
      ...dispatchSweepDeps(),
      enqueuePublish: async (intent) => {
        await triggerPublishPost(intent)
      },
    }),
})
