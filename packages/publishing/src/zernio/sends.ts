import type { ReplyWireFields } from '@sahoda/shared'

import { createJsonCaller, type ZernioClientDeps } from './client'
import type { ScopedAccountId, ScopedProfileId } from './scope'

/**
 * Zernio's inbox WRITE surface — the three replies: a DM, a comment, a review.
 *
 * ── WHY THIS IS A SEPARATE FILE FROM `./reads` ───────────────────────────────
 * `reads.ts` states that it contains no send, reply or delete "by design", and
 * `apps/web/src/lib/inbox/read.ts` leans on that: a screen that displays a conversation
 * holds a `ZernioReads`, which has no method that could post. That property is worth
 * more than the convenience of one combined port. Only the send path takes a
 * `ZernioSends`, so the capability to reply is granted where it is used and nowhere else.
 *
 * ── PROVENANCE: EVERY SHAPE HERE IS `[DOC]` ──────────────────────────────────
 * Paths, bodies and response envelopes come from the OpenAPI spec at
 * `docs.zernio.com/api/openapi` — operations `sendInboxMessage`, `replyToInboxPost`,
 * `replyToInboxReview`. Zernio has never accepted a reply from this codebase, so
 * nothing in this file is `[LIVE]`, and doc 13 §0 forbids promoting it without a raw
 * payload. The first real send should be captured and this notice re-tiered.
 *
 * ── THE TENANT BOUNDARY IS THE PARAMETER LIST ────────────────────────────────
 * Doc 13 §3: Zernio validates `accountId` against your whole TEAM, not against the
 * profile in the request. A wrong id does not error — it acts on another customer's
 * account and returns HTTP 200. On a read that is a leak; here it puts words in
 * somebody else's voice, publicly, under their name.
 *
 * So every method takes `profile: ScopedProfileId` FIRST and `account: ScopedAccountId`
 * second. Neither can be a plain string, `scopeAccount` cannot mint the account without
 * the profile, and the profile is required even though these three endpoints take no
 * profile filter — it is the witness that a workspace was resolved before anybody was
 * addressed. Omitting it is a compile error, which is the only kind of check that
 * cannot be forgotten (§10 is this repo's record of a runtime one that was).
 */

/**
 * The outcome of a reply attempt.
 *
 * ── `sent: true` IS UNCONSTRUCTIBLE WITHOUT THE PLATFORM'S OWN ID ────────────
 * Same rule as `.is-real` on publish, where a post counts as real only when
 * `platformPostUrl` names it (doc 13 §5). A 200 is not evidence: the spec says
 * `messageId` is "not returned for Reddit", so an id-less 200 is a NORMAL response, not
 * an error. Recording that as sent would put a reply in the customer's thread that may
 * never have reached anyone — a fake success on a delay, which this product forbids.
 *
 * A union rather than `{ sent: boolean; platformId?: string }`: the optional field
 * version lets a caller set `sent: true` and forget the id, which is the exact mistake.
 */
export type ReplyReceipt = { sent: true; platformId: string } | { sent: false; detail: string }

export interface SendMessageInput {
  message: string
  /**
   * The tag fields, already authorised. Minted only by `authoriseReply` in
   * `@sahoda/shared`, which checks them against the thread's live window — so a tag
   * cannot be chosen here, only carried.
   */
  wire?: ReplyWireFields
}

export interface ReplyToCommentInput {
  message: string
  /** Threads the reply under one comment. Absent = a top-level comment on the post. */
  commentId?: string
}

export interface ReplyToReviewInput {
  message: string
}

export interface ZernioSends {
  /**
   * Reply in a DM thread. `conversationId` is the platform's id from the list read,
   * not an internal one.
   *
   * The window is NOT checked here — `authoriseReply` owns that, and it needs the
   * thread's messages, which this module does not read. What this guarantees is that
   * whatever tag fields arrive are the ones put on the wire, unmodified.
   */
  sendMessage(
    profile: ScopedProfileId,
    account: ScopedAccountId,
    conversationId: string,
    input: SendMessageInput,
  ): Promise<ReplyReceipt>

  /**
   * Reply to a comment on a post.
   *
   * `platformPostId` is the PLATFORM's id — Instagram's media id, X's tweet id — the
   * same key `listPostComments` takes. Zernio's own 24-hex `_id` is a different id and
   * this repo has already shipped that confusion once, on the analytics side.
   */
  replyToComment(
    profile: ScopedProfileId,
    account: ScopedAccountId,
    platformPostId: string,
    input: ReplyToCommentInput,
  ): Promise<ReplyReceipt>

  /** Reply to a review. Google Business ids are resource names and get URL-encoded. */
  replyToReview(
    profile: ScopedProfileId,
    account: ScopedAccountId,
    reviewId: string,
    input: ReplyToReviewInput,
  ): Promise<ReplyReceipt>
}

/**
 * Turn whatever the platform named into a receipt.
 *
 * Anything that is not a non-empty string is "not named" — including `''`, which some
 * APIs return in place of a missing field and which would otherwise satisfy a bare
 * truthiness check on the wrong side.
 */
function receipt(platformId: unknown, what: string): ReplyReceipt {
  if (typeof platformId === 'string' && platformId.trim() !== '') {
    return { sent: true, platformId }
  }
  return {
    sent: false,
    detail: `Zernio accepted the ${what} but returned no platform id for it, so Sahoda cannot confirm it was delivered.`,
  }
}

/** A blank reply is a guaranteed 400. Refuse it here rather than spend the round trip. */
function assertMessage(message: string): string {
  const trimmed = message.trim()
  if (trimmed === '') {
    throw new Error('A reply cannot be empty.')
  }
  return trimmed
}

export function createZernioSends(deps: ZernioClientDeps): ZernioSends {
  // The SAME caller the read surface uses, so the content-type-and-named-field
  // assertion that defends against the HTML catch-all (doc 13 §2.1) applies to writes
  // too. A send that "succeeded" against a Next.js shell is the worst version of that
  // bug, and a second caller here would eventually drift from the first.
  const json = createJsonCaller(deps)

  return {
    async sendMessage(_profile, account, conversationId, input) {
      const { data } = await json<{ data?: { messageId?: unknown } }>(
        'POST',
        `/inbox/conversations/${encodeURIComponent(conversationId)}/messages`,
        'sendMessage',
        {
          accountId: account,
          message: assertMessage(input.message),
          // Spread rather than set: `authoriseReply` returns `{}` for an open window,
          // and explicit `undefined`s would serialise as absent anyway but read as
          // though a decision about tagging were being made here. It is not.
          ...(input.wire ?? {}),
        },
      )
      return receipt(data.data?.messageId, 'reply')
    },

    async replyToComment(_profile, account, platformPostId, input) {
      const { data } = await json<{ data?: { commentId?: unknown } }>(
        'POST',
        `/inbox/comments/${encodeURIComponent(platformPostId)}`,
        'replyToComment',
        {
          accountId: account,
          message: assertMessage(input.message),
          ...(input.commentId === undefined ? {} : { commentId: input.commentId }),
        },
      )
      return receipt(data.data?.commentId, 'comment reply')
    },

    async replyToReview(_profile, account, reviewId, input) {
      // A GBP review id is `accounts/{a}/locations/{l}/reviews/{r}` — slashes and all.
      // Unencoded it addresses a different path entirely, which is the failure mode that
      // comes back as a 200 from something that is not this endpoint.
      const { data } = await json<{ reply?: { id?: unknown } }>(
        'POST',
        `/inbox/reviews/${encodeURIComponent(reviewId)}/reply`,
        'replyToReview',
        { accountId: account, message: assertMessage(input.message) },
      )
      // A THIRD envelope: no `success`, no `data`, the id sits at `reply.id`. Sharing one
      // accessor across the three would resolve to undefined here and quietly report
      // every review reply as unconfirmed.
      return receipt(data.reply?.id, 'review reply')
    },
  }
}
