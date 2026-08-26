import { z } from 'zod'
import {
  ChannelSchema,
  PostStatusSchema,
  PostOriginSchema,
  VariantPublishStatusSchema,
  PlannerEventKindSchema,
  PublishModeSchema,
  PublishLogStatusSchema,
} from '../enums'
import { JsonbSchema } from '../common'
import { ChannelSetSchema, EMPTY_CHANNEL_SET } from './channel-set'

// ── posts ────────────────────────────────────────────────────────────────────
// `channels` is `ChannelSetSchema`, not `z.array(ChannelSchema)`, on all three:
// the column is a bare `text[]`, every consumer reads it as a set, and the three
// duplicate-channel defects of 2026-08-09/10 all came from that gap. Parsing is
// the one place both the read and the write must pass through, so it is the one
// place the dedupe belongs. See `channel-set.ts` for the full account.
export const PostSchema = z.object({
  id: z.uuid(),
  workspace_id: z.uuid(),
  title: z.string().nullable(),
  body: z.string().nullable(),
  // The body as a model first produced it. `.optional()` as well as
  // `.nullable()` because this is a READ shape: a select that does not name the
  // column must still parse, and every existing select predates it. Nullable is
  // the row's own answer (no model wrote this); optional is "you did not ask".
  // Those are different facts and collapsing them would report a human-written
  // post and an unasked-for column as the same thing.
  generated_body: z.string().nullable().optional(),
  status: PostStatusSchema,
  channels: ChannelSetSchema,
  scheduled_at: z.string().nullable(),
  origin: PostOriginSchema,
  created_by: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
})
export type Post = z.infer<typeof PostSchema>

export const PostInsertSchema = z.object({
  workspace_id: z.uuid(),
  title: z.string().nullable().optional(),
  body: z.string().nullable().optional(),
  status: PostStatusSchema.default('draft'),
  channels: ChannelSetSchema.default(EMPTY_CHANNEL_SET),
  scheduled_at: z.string().nullable().optional(),
  origin: PostOriginSchema.default('manual'),
  // Set ONLY by a path where a model produced the text. Never copied from
  // `body` for a post a person typed - that would invent a model draft and make
  // the edit distance read zero for work the model never did.
  generated_body: z.string().nullable().optional(),
  created_by: z.string().min(1),
})
export type PostInsert = z.infer<typeof PostInsertSchema>

// `generated_body` is deliberately ABSENT from both Update schemas. The column
// is write-once and the database refuses to move it, so admitting it here would
// build a request that Postgres rejects. The omission is the contract, not a gap.
export const PostUpdateSchema = z
  .object({
    title: z.string().nullable(),
    body: z.string().nullable(),
    status: PostStatusSchema,
    channels: ChannelSetSchema,
    scheduled_at: z.string().nullable(),
  })
  .partial()
export type PostUpdate = z.infer<typeof PostUpdateSchema>

// ── post_variants ─────────────────────────────────────────────────────────────
export const PostVariantSchema = z.object({
  id: z.uuid(),
  workspace_id: z.uuid(),
  post_id: z.uuid(),
  channel: ChannelSchema,
  body: z.string(),
  generated_body: z.string().nullable().optional(),
  extras: JsonbSchema.nullable(),
  is_linked: z.boolean(),
  char_count: z.int().nullable(),
  publish_status: VariantPublishStatusSchema,
  platform_post_id: z.string().nullable(),
  permalink: z.string().nullable(),
  last_error: JsonbSchema.nullable(),
  created_at: z.string(),
  updated_at: z.string(),
})
export type PostVariant = z.infer<typeof PostVariantSchema>

export const PostVariantInsertSchema = z.object({
  workspace_id: z.uuid(),
  post_id: z.uuid(),
  channel: ChannelSchema,
  body: z.string(),
  generated_body: z.string().nullable().optional(),
  extras: JsonbSchema.nullable().optional(),
  is_linked: z.boolean().default(true),
  char_count: z.int().nullable().optional(),
})
export type PostVariantInsert = z.infer<typeof PostVariantInsertSchema>

// Absent for the same reason as `PostUpdateSchema` above: write-once.
export const PostVariantUpdateSchema = z
  .object({
    body: z.string(),
    extras: JsonbSchema.nullable(),
    is_linked: z.boolean(),
    char_count: z.int().nullable(),
  })
  .partial()
export type PostVariantUpdate = z.infer<typeof PostVariantUpdateSchema>

// ── post_media ────────────────────────────────────────────────────────────────
export const PostMediaSchema = z.object({
  id: z.uuid(),
  workspace_id: z.uuid(),
  post_id: z.uuid(),
  storage_path: z.string(),
  mime: z.string().nullable(),
  bytes: z.int().nullable(),
  width: z.int().nullable(),
  height: z.int().nullable(),
  alt: z.string().nullable(),
  meta: JsonbSchema.nullable(),
  created_at: z.string(),
  updated_at: z.string(),
})
export type PostMedia = z.infer<typeof PostMediaSchema>

export const PostMediaInsertSchema = z.object({
  workspace_id: z.uuid(),
  post_id: z.uuid(),
  storage_path: z.string().min(1),
  mime: z.string().nullable().optional(),
  bytes: z.int().nullable().optional(),
  width: z.int().nullable().optional(),
  height: z.int().nullable().optional(),
  alt: z.string().nullable().optional(),
  meta: JsonbSchema.nullable().optional(),
})
export type PostMediaInsert = z.infer<typeof PostMediaInsertSchema>

// ── post_publish_logs (append-only) ──────────────────────────────────────────
export const PostPublishLogSchema = z.object({
  id: z.uuid(),
  workspace_id: z.uuid(),
  post_id: z.uuid(),
  variant_id: z.uuid().nullable(),
  connection_id: z.uuid().nullable(),
  channel: ChannelSchema,
  attempt: z.int(),
  status: PublishLogStatusSchema,
  mode: PublishModeSchema,
  platform_post_id: z.string().nullable(),
  permalink: z.string().nullable(),
  error: JsonbSchema.nullable(),
  job_run_id: z.string().nullable(),
  published_at: z.string().nullable(),
  created_at: z.string(),
})
export type PostPublishLog = z.infer<typeof PostPublishLogSchema>

// ── planner_events ────────────────────────────────────────────────────────────
export const PlannerEventSchema = z.object({
  id: z.uuid(),
  workspace_id: z.uuid(),
  kind: PlannerEventKindSchema,
  title: z.string(),
  starts_at: z.string(),
  ends_at: z.string().nullable(),
  all_day: z.boolean(),
  post_id: z.uuid().nullable(),
  meta: JsonbSchema.nullable(),
  created_at: z.string(),
  updated_at: z.string(),
})
export type PlannerEvent = z.infer<typeof PlannerEventSchema>

export const PlannerEventInsertSchema = z.object({
  workspace_id: z.uuid(),
  kind: PlannerEventKindSchema.default('note'),
  title: z.string().min(1),
  starts_at: z.string(),
  ends_at: z.string().nullable().optional(),
  all_day: z.boolean().default(false),
  post_id: z.uuid().nullable().optional(),
  meta: JsonbSchema.nullable().optional(),
})
export type PlannerEventInsert = z.infer<typeof PlannerEventInsertSchema>
