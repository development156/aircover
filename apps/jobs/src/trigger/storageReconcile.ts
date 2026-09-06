import { schedules } from '@trigger.dev/sdk'

import { runStorageReconcile, type StorageReconcileReport } from '../storage/reconcile'
import { storageReconcileDeps } from '../storage/deps'

export const STORAGE_RECONCILE_TASK_ID = 'storage-reconcile'

/**
 * The orphan sweep over the media bucket, as a Trigger.dev scheduled task
 * WITHOUT a declared schedule.
 *
 * ── NOTHING IS ARMED HERE, DELIBERATELY ──────────────────────────────────────
 * There is no `cron:` on this task, so deploying it runs nothing. To schedule it
 * a person attaches a schedule to `storage-reconcile` in the Trigger.dev
 * dashboard (or `schedules.create({ task: STORAGE_RECONCILE_TASK_ID, cron })`),
 * and even then it only LISTS and COUNTS until `SAHODA_STORAGE_RECONCILE=delete`
 * is set on the environment. Two switches, both off.
 *
 * And the honest status, same as every other task in this folder: nothing in
 * apps/jobs has ever been deployed to Trigger.dev. The runner that exists is
 * `scripts/storage-reconcile.ts` under a scheduled GitHub Action, the way
 * `audience-capture.ts` runs — which is also unarmed until an owner names this
 * branch in the workflow.
 */
export const storageReconcileTask = schedules.task({
  id: STORAGE_RECONCILE_TASK_ID,
  run: async (): Promise<StorageReconcileReport> => runStorageReconcile(storageReconcileDeps()),
})
