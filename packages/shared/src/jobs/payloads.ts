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

/** Build the publishPost idempotency key. One definition, so callers cannot drift. */
export const publishIdempotencyKey = (
  postId: string,
  channel: z.infer<typeof ChannelSchema>,
  scheduledAt: string,
): string => `${postId}:${channel}:${scheduledAt}`

/** The expired-hold sweep reaper (§3.6) — releases stranded HOLDs. No args. */
export const HoldSweepPayloadSchema = z.object({})
export type HoldSweepPayload = z.infer<typeof HoldSweepPayloadSchema>

/**
 * `planWeek` — the durable wrapper around the plan_week mesh task, triggered by the
 * planner in apps/web. The goals/channels fields mirror the mesh task's local input; the
 * job re-validates them here so a bad payload is rejected BEFORE credits are reserved.
 */
export const PlanWeekJobPayloadSchema = z.object({
  workspaceId: z.uuid(),
  traceId: z.string().min(1),
  goals: z.string().default(''),
  channels: z.array(ChannelSchema).min(1),
})
export type PlanWeekJobPayload = z.infer<typeof PlanWeekJobPayloadSchema>
