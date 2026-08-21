import 'server-only'

import {
  CHANNEL,
  bool,
  insertMessage,
  num,
  str,
  upsertThread,
  type ProjectionOutcome,
  type Queryable,
} from './webhook-store'

/**
 * The three inbox events, projected onto `inbox_threads` / `inbox_messages`.
 *
 * These are the events that make the inbox local. Everything the inbox renders can
 * be answered from these two tables afterwards, which is what lets it survive Zernio
 * being unreachable.
 *
 * ── THE VOCABULARY MISMATCH THIS FILE OWNS ───────────────────────────────────
 * Zernio's wire says `incoming` / `outgoing`. This database says `inbound` /
 * `outbound`. An earlier session wrote `inbound` into a type asserting it was the
 * wire value and was wrong; the first real payloads settled it on 2026-08-10.
 * Translated once, here, at the boundary — never twice, and never in a template.
 */

/** `message.received` — a DM. */
export async function projectMessage(
  db: Queryable,
  args: { payload: Record<string, unknown>; workspaceId: string },
): Promise<ProjectionOutcome> {
  const msg = args.payload.message
  const platform = str(msg, 'platform')
  if (platform === null) return { kind: 'referent_absent', what: 'message.platform' }

  // Zernio delivers DMs for instagram, facebook, telegram, whatsapp and sms. Four of
  // those five have no channel in this database. Stored, not filed, and named.
  const channel = CHANNEL[platform]
  if (channel === undefined) return { kind: 'channel_not_representable', platform }

  const platformMessageId = str(msg, 'platformMessageId') ?? str(msg, 'id')
  if (platformMessageId === null) {
    return { kind: 'referent_absent', what: 'message.platformMessageId' }
  }

  // The thread key, in the order the payload prefers it. `platformConversationId` is
  // the platform's own id and is what a second delivery for the same conversation
  // will also carry; Zernio's internal `conversation.id` is the fallback.
  const conversationId =
    str(args.payload, 'conversation', 'platformConversationId') ??
    str(args.payload, 'conversation', 'id') ??
    str(msg, 'conversationId')
  if (conversationId === null) return { kind: 'referent_absent', what: 'conversation id' }

  const threadId = await upsertThread(db, {
    workspaceId: args.workspaceId,
    channel,
    kind: 'dm',
    platformThreadId: conversationId,
    authorName: str(args.payload, 'conversation', 'participantName') ?? str(msg, 'sender', 'name'),
    authorHandle:
      str(args.payload, 'conversation', 'participantUsername') ?? str(msg, 'sender', 'username'),
    rating: null,
    body: str(msg, 'text'),
    permalink: null,
    postedAt: str(msg, 'sentAt'),
  })

  const rows = await insertMessage(db, {
    workspaceId: args.workspaceId,
    threadId,
    direction: str(msg, 'direction') === 'outgoing' ? 'outbound' : 'inbound',
    // `text` is nullable on the wire — an attachment-only message is a real thing.
    // Empty string, never the word "null", and never a fabricated description of
    // the attachment.
    body: str(msg, 'text') ?? '',
    platformMessageId,
    sentAt: str(msg, 'sentAt'),
  })

  return { kind: 'projected', surface: 'inbox', rows }
}

/** `comment.received` — a comment on a post. */
export async function projectComment(
  db: Queryable,
  args: { payload: Record<string, unknown>; workspaceId: string },
): Promise<ProjectionOutcome> {
  const c = args.payload.comment
  const platform = str(c, 'platform')
  if (platform === null) return { kind: 'referent_absent', what: 'comment.platform' }

  // Seven platforms send comments (instagram, facebook, twitter, youtube, linkedin,
  // bluesky, reddit); three of them map onto a channel here.
  const channel = CHANNEL[platform]
  if (channel === undefined) return { kind: 'channel_not_representable', platform }

  const commentId = str(c, 'id')
  if (commentId === null) return { kind: 'referent_absent', what: 'comment.id' }
  const platformPostId = str(c, 'platformPostId')
  if (platformPostId === null) return { kind: 'referent_absent', what: 'comment.platformPostId' }

  const threadId = await upsertThread(db, {
    workspaceId: args.workspaceId,
    channel,
    kind: 'comment',
    // THE THREAD IS THE POST, not the individual comment. That is what makes a
    // second comment join the first rather than open a new row beside it — and it
    // is why `platform_thread_id` here is the post's id while the MESSAGE below
    // carries the comment's.
    platformThreadId: platformPostId,
    authorName: str(c, 'author', 'name'),
    authorHandle: str(c, 'author', 'username'),
    rating: null,
    body: str(c, 'text'),
    permalink: null,
    postedAt: str(c, 'createdAt'),
  })

  // `isOwnAccount` is documented as: "True when this comment was authored by the
  // connected account itself (Meta re-delivers the account's own replies as comments
  // events). Populated on the Instagram and Facebook realtime webhooks only; ABSENT
  // MEANS NOT EVALUATED, NEVER 'NOT THE ACCOUNT'."
  //
  // So only an explicit `true` makes this outbound. `bool()` returns undefined for
  // an absent field rather than coercing it to false, which is the difference
  // between reading the flag and inventing one.
  const authoredByUs = bool(c, 'author', 'isOwnAccount') === true

  const rows = await insertMessage(db, {
    workspaceId: args.workspaceId,
    threadId,
    direction: authoredByUs ? 'outbound' : 'inbound',
    body: str(c, 'text') ?? '',
    platformMessageId: commentId,
    sentAt: str(c, 'createdAt'),
  })

  return { kind: 'projected', surface: 'inbox', rows }
}

/** `review.new` and `review.updated` — Google Business Profile reviews. */
export async function projectReview(
  db: Queryable,
  args: { payload: Record<string, unknown>; workspaceId: string },
): Promise<ProjectionOutcome> {
  const r = args.payload.review
  const platform = str(r, 'platform')
  if (platform === null) return { kind: 'referent_absent', what: 'review.platform' }

  const channel = CHANNEL[platform]
  if (channel === undefined) return { kind: 'channel_not_representable', platform }

  const reviewId = str(r, 'id')
  if (reviewId === null) return { kind: 'referent_absent', what: 'review.id' }

  // The table admits 1-5 or null. A rating outside that range is stored as NULL
  // rather than clamped: clamping a 0 to a 1 would invent a star nobody gave, and
  // every average drawn from this column would carry it forever.
  const raw = num(r, 'rating')
  const rating = raw !== null && Number.isInteger(raw) && raw >= 1 && raw <= 5 ? raw : null

  const threadId = await upsertThread(db, {
    workspaceId: args.workspaceId,
    channel,
    kind: 'review',
    platformThreadId: reviewId,
    authorName: str(r, 'reviewer', 'name'),
    authorHandle: null,
    rating,
    body: str(r, 'text'),
    permalink: null,
    postedAt: str(r, 'createdAt'),
  })

  const body = str(r, 'text')
  // A review with no text is real — a bare star rating. The thread carries the
  // rating and there is nothing to say; an empty message would put a blank bubble
  // in the conversation and imply the reviewer wrote something.
  if (body === null) return { kind: 'projected', surface: 'inbox', rows: 0 }

  const rows = await insertMessage(db, {
    workspaceId: args.workspaceId,
    threadId,
    direction: 'inbound',
    body,
    platformMessageId: reviewId,
    sentAt: str(r, 'createdAt'),
  })

  return { kind: 'projected', surface: 'inbox', rows }
}
