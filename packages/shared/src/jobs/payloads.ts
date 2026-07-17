import { z } from 'zod'
import { ChannelSchema } from '../enums'

/**
 * Trigger.dev task payloads. `publishPost` uses idempotency key
 * `${postId}:${channel}:${scheduledAt}` (TSD §8) so a duplicate enqueue yields a
 * single platform post.
 */
export const PublishPostPayloadSchema = z.object({
  workspaceId: z.uuid(),
  postId: z.uuid(),
  variantId: z.uuid(),
  channel: ChannelSchema,
  scheduledAt: z.string(), // ISO-8601
})
export type PublishPostPayload = z.infer<typeof PublishPostPayloadSchema>

/** The expired-hold sweep reaper (§3.6) — releases stranded HOLDs. No args. */
export const HoldSweepPayloadSchema = z.object({})
export type HoldSweepPayload = z.infer<typeof HoldSweepPayloadSchema>
