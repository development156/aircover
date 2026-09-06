// `@sahoda/jobs/sweeps` — the scheduled sweeps, reachable WITHOUT the Trigger.dev SDK.
//
// The package barrel (`.`) exports the durable task wrappers, and importing it pulls
// @trigger.dev/sdk in with them. apps/web needs the sweeps and not the SDK: its cron route
// is a serverless function that runs SQL, and the fallback runner sanctioned in
// apps/jobs/CLAUDE.md (Vercel cron) is only a wrapper swap if the cores can be reached
// without the runner they were written for. That is what this entry point is.
//
// The boundary is enforced by sweeps.test.ts, which walks this file's real import graph
// and fails if @trigger.dev (or the model mesh, or the publishing adapters) is reachable.
// Add re-exports here only after checking what they drag along.
//
// Server-only, exactly like the barrel: these deps hold a service-role database URL.
export { runDispatchSweep } from './dispatch/sweep'
export type {
  DecisionSummary,
  DispatchSweepDeps,
  DispatchSweepReport,
  EnqueuePublishIntent,
} from './dispatch/sweep'

export { PublishQueueUnavailableError, isPublishQueueUnavailable } from './dispatch/queue'

export { sweepExpiredHolds } from './holds/sweep'
export type { ExpiredHold, HoldSweepDeps, HoldSweepReport } from './holds/sweep'

export { dispatchSweepDeps, holdSweepDeps, getRuntime } from './runtime'

// The media-bucket orphan sweep. SQL plus the storage REST endpoint, nothing from
// @sahoda/publishing, so it belongs on this SDK-free entry point. Dry-run unless
// `SAHODA_STORAGE_RECONCILE=delete`.
export { runStorageReconcile, storageReconcileMode } from './storage/reconcile'
export type {
  StorageReconcileDeps,
  StorageReconcileMode,
  StorageReconcileReport,
} from './storage/reconcile'
export { storageReconcileDeps } from './storage/deps'
export type { SweepBatchOptions } from './runtime'

export { loadJobsEnv } from './env'
export type { HoldSweepMode, DispatchMode, JobsEnv, SweepMode } from './env'
