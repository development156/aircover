// apps/jobs — Trigger.dev durable tasks: publishPost (idempotency key
// `${postId}:${channel}:${scheduledAt}`, retries x3 expo) and the expired-hold
// sweep (releases stranded HOLDs). Later: the Loop orchestration. Owned by wt-jobs.
//
// Nothing publishes without writing a post_publish_logs row. Task payloads come
// from @sahoda/shared (PublishPostPayload, HoldSweepPayload).
export const JOBS_PACKAGE = '@sahoda/jobs' as const
