import { task } from '@trigger.dev/sdk'
import { PublishPostPayloadSchema, publishIdempotencyKey } from '@sahoda/shared'
import type { PublishPostPayload } from '@sahoda/shared'
import { runPublishPost, type PublishOutcome } from '../publish/runPublishPost'
import { publishPostDeps } from '../publish/deps'

export const PUBLISH_POST_TASK_ID = 'publish-post'

/**
 * The durable publishPost task — a thin wrapper. All behaviour lives in runPublishPost so
 * it is testable without this SDK and so the sanctioned QStash fallback is a swap here.
 *
 * Retries are x3 exponential and belong to this layer alone: adapters classify and never
 * retry. The core rethrows a TRANSIENT AdapterError to reach this retry policy and returns
 * a PERMANENT one terminally, so attempts are never burned on an unfixable failure.
 */
export const publishPostTask = task({
  id: PUBLISH_POST_TASK_ID,
  retry: {
    maxAttempts: 3,
    factor: 2,
    minTimeoutInMs: 1_000,
    maxTimeoutInMs: 30_000,
    randomize: true,
  },
  run: async (payload: PublishPostPayload, { ctx }): Promise<PublishOutcome> => {
    // Re-validate at the boundary: the payload crossed a queue to get here.
    const parsed = PublishPostPayloadSchema.parse(payload)
    return runPublishPost(
      parsed,
      { attempt: ctx.attempt.number, jobRunId: ctx.run.id },
      publishPostDeps(),
    )
  },
})

/**
 * Enqueue a publish. The idempotency key is `${postId}:${channel}:${scheduledAt}` (TSD §8),
 * built by the shared helper so a duplicate enqueue collapses to one platform post.
 */
export function triggerPublishPost(payload: PublishPostPayload) {
  return publishPostTask.trigger(payload, {
    idempotencyKey: publishIdempotencyKey(payload.postId, payload.channel, payload.scheduledAt),
  })
}
