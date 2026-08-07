import { z } from 'zod'
import { ChannelSchema } from '../enums'

/**
 * Inbox row contracts (FSD M7). One conversation per thread, one row per message.
 *
 * These describe rows that do not exist yet: no verified read API for GBP reviews
 * is available, so nothing writes them. The shapes are pinned now so the eventual
 * ingest is a writer rather than a migration plus a rewrite of every reader.
 */

export const InboxKindSchema = z.enum(['review', 'comment', 'mention', 'dm', 'question'])
export type InboxKind = z.infer<typeof InboxKindSchema>

export const InboxStatusSchema = z.enum(['open', 'snoozed', 'resolved'])
export type InboxStatus = z.infer<typeof InboxStatusSchema>

export const InboxThreadSchema = z.object({
  id: z.uuid(),
  workspace_id: z.uuid(),
  channel: ChannelSchema,
  kind: InboxKindSchema,
  platform_thread_id: z.string(),
  author_name: z.string().nullable(),
  author_handle: z.string().nullable(),
  /** 1–5 on a review, null everywhere else. */
  rating: z.int().min(1).max(5).nullable(),
  body: z.string().nullable(),
  permalink: z.string().nullable(),
  status: InboxStatusSchema,
  snoozed_until: z.string().nullable(),
  assigned_to: z.string().nullable(),
  /** When the PLATFORM says it happened — not when we learned of it. */
  posted_at: z.string().nullable(),
  first_seen_at: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
})
export type InboxThread = z.infer<typeof InboxThreadSchema>

export const InboxMessageSchema = z.object({
  id: z.uuid(),
  workspace_id: z.uuid(),
  thread_id: z.uuid(),
  direction: z.enum(['inbound', 'outbound']),
  body: z.string(),
  /**
   * The platform's own id. NULL means drafted here and never sent — the same test
   * `.is-real` applies everywhere: a thing is real when the platform has named it.
   */
  platform_message_id: z.string().nullable(),
  sent_at: z.string().nullable(),
  author_user_id: z.string().nullable(),
  created_at: z.string(),
})
export type InboxMessage = z.infer<typeof InboxMessageSchema>

/** What a member may insert: a draft reply, and nothing that claims to have been sent. */
export const InboxDraftReplySchema = z.object({
  thread_id: z.uuid(),
  body: z.string().min(1).max(4000),
})
export type InboxDraftReply = z.infer<typeof InboxDraftReplySchema>

/** A message the platform has confirmed. Presence of both fields is the whole test. */
export function isSentMessage(
  message: InboxMessage,
): message is InboxMessage & { platform_message_id: string; sent_at: string } {
  return message.platform_message_id !== null && message.sent_at !== null
}
