// apps/jobs — Trigger.dev durable tasks: publishPost (idempotency key
// `${postId}:${channel}:${scheduledAt}`, retries x3 expo), the expired-hold sweep
// (releases stranded HOLDs), and plan-week. Later: the Loop orchestration. Owned by wt-jobs.
//
// Nothing publishes without writing a post_publish_logs row. Task payloads come from
// @sahoda/shared (PublishPostPayload, HoldSweepPayload, PlanWeekJobPayload).
//
// Server-only: the runtime holds a service-role database URL. Never import from client code.
export const JOBS_PACKAGE = '@sahoda/jobs' as const

// Job cores — deliberately free of any scheduler SDK, so they are unit-testable and the
// sanctioned Vercel-cron + QStash fallback stays a wrapper swap.
export { runPublishPost } from './publish/runPublishPost'
export type {
  PublishJobContext,
  PublishLogEntry,
  PublishLogError,
  PublishMode,
  PublishOutcome,
  PublishPostDeps,
  PublishVariant,
  ResolvedConnection,
  VariantUpdate,
} from './publish/runPublishPost'

export { createAdapterSelector } from './publish/adapters'
export type { AdapterSelectorDeps } from './publish/adapters'
export { createConnectionResolver } from './publish/tokens'
export type { ConnectionResolverDeps, OpenSecret, StoredConnection } from './publish/tokens'
export { createPublishStore } from './publish/store'

export { sweepExpiredHolds } from './holds/sweep'
export type { ExpiredHold, HoldSweepDeps, HoldSweepReport } from './holds/sweep'
export { createExpiredHoldSource } from './holds/pgHolds'

export { runDispatchSweep } from './dispatch/sweep'
export type {
  DecisionSummary,
  DispatchSweepDeps,
  DispatchSweepReport,
  EnqueuePublishIntent,
} from './dispatch/sweep'
export { classifyCandidate } from './dispatch/classify'
export type {
  CandidateVariant,
  DispatchCandidate,
  DispatchDecision,
  DispatchVariantIntent,
  HoldReason,
} from './dispatch/classify'
export { createDispatchStore } from './dispatch/pgDispatch'

export { runPlanWeek } from './ai/plan-week'
export { runPlanWeekJob } from './ai/plan-week-job'
export type { BriefInsert, PlanWeekJobDeps, PlanWeekJobResult } from './ai/plan-week-job'

export { loadJobsEnv } from './env'
export type { DispatchMode, JobsEnv } from './env'

// Durable task wrappers + their trigger helpers (the surface apps/web calls).
export { publishPostTask, triggerPublishPost, PUBLISH_POST_TASK_ID } from './trigger/publishPost'
export { holdSweepTask, HOLD_SWEEP_TASK_ID } from './trigger/holdSweep'
export { dispatchSweepTask, DISPATCH_SWEEP_TASK_ID } from './trigger/dispatchSweep'
export { planWeekTask, triggerPlanWeek, PLAN_WEEK_TASK_ID } from './trigger/planWeek'
