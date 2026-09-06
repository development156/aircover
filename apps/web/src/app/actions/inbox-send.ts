'use server'

import { auth } from '@clerk/nextjs/server'
import { revalidatePath } from 'next/cache'
import { MessageTagSchema, type ReplyIntent } from '@sahoda/shared'

import {
  replyToComment as performCommentReply,
  replyToReview as performReviewReply,
  replyToThread as performThreadReply,
  type ReplyDeps,
  type SendOutcome,
} from '@/lib/inbox/send'
import { commentsHref } from '@/components/inbox/commented-post-row'
import { threadHref } from '@/components/inbox/thread-href'
import { scopedAccount } from '@/lib/inbox/read'
import { recordSentReply } from '@/lib/inbox/record-sent'
import { resolveAttachment, type ResolvedAttachment } from '@/lib/inbox/attachment-asset'
import { reportServerError } from '@/lib/observability/report'
import { zernioClientSends } from '@/lib/zernio/server'
import { activeWorkspaceRead } from '@/lib/workspaces'

/**
 * Sending an inbox reply through Zernio: a DM, a comment, a review.
 *
 * ── WHY THIS IS A DIFFERENT FILE FROM `actions/inbox.ts` ─────────────────────
 * That one drafts into `inbox_messages`, the local FSD M7 tables, which ship empty and
 * have no ingest. This one talks to Zernio, where the conversations the customer can
 * actually see live. They are two different inboxes today and merging them would
 * suggest a link that does not exist.
 *
 * ── A CONFIRMED REPLY IS NOW RECORDED LOCALLY ────────────────────────────────
 * It used to be recorded nowhere, for three stated reasons, and all three expired:
 *
 *  1. "`inbox_threads.channel` cannot express facebook" — widened on 2026-08-26 by
 *     `20260826120001_widen_channels_facebook_telegram.sql`. It admits all six
 *     channels `ChannelSchema` names.
 *  2. "`inbox_threads` has no INSERT policy for `authenticated`" — true, and beside
 *     the point. The webhook receiver writes these tables over a direct Postgres
 *     connection precisely because it is not a member; `recordSentReply` uses the
 *     same door, for the same reason, and weakens neither the policy nor its CHECK.
 *  3. "Nothing reads those tables" — the list and both thread routes read them now.
 *
 * What made the old choice safe was the thread re-reading Zernio on every render.
 * The list is store-first today, so a reply the customer had just sent was missing
 * from the screen they sent it from until a webhook happened to bring it back.
 *
 * ── THE ID RULE SURVIVES THE ROUND TRIP ──────────────────────────────────────
 * `SendOutcome` has no branch that reports success without a platform id, and the
 * store write happens ONLY on `sent` — the row's `platform_message_id` is the
 * platform's own receipt, which is the only evidence this codebase accepts. An
 * unconfirmed reply writes nothing, because "it may have gone" is not a message.
 *
 * ── REVALIDATION, HOWEVER, RUNS ON EVERY OUTCOME ─────────────────────────────
 * It used to run only on `sent`, on the reasoning that a refused send has nothing
 * new to show. It does: an `unconfirmed` reply MAY have landed, and the thread's
 * next render is the only way the customer finds out. Leaving the cached page in
 * place is what turns "we do not know" into "nothing happened". Revalidation shows
 * what is there; it never claims anything.
 *
 * ── THE REVALIDATED PATH COMES FROM THE LINK HELPERS ─────────────────────────
 * `threadHref` / `commentsHref` build these URLs for the links that got the user here,
 * and they `encodeURIComponent` each segment. A hand-interpolated copy would differ on
 * exactly the ids that contain a slash — Facebook conversation ids like `t_100/200` —
 * turning a two-segment route into three, matching nothing, and making `revalidatePath`
 * a silent no-op after a CONFIRMED send. One path rule, one implementation.
 */

/**
 * The three ways a reply does not get sent are carried separately, because the UI must
 * say different things about them. `refused` is neutral information about the
 * platform's rules; `unconfirmed` is a warning the customer has to act on — the reply
 * may or may not have landed; `failed` is ours and is worth retrying.
 */
export type InboxSendState =
  | { ok: true; platformId: string }
  | { ok: false; status: 'refused' | 'unconfirmed' | 'failed'; message: string }

/** Every branch that is not a confirmed send becomes a sentence, never a silent false. */
async function toState(
  outcome: SendOutcome,
  path: string,
  /** How to file a confirmed reply. Absent where the surface has no thread to file it on. */
  record?: (platformId: string) => Promise<unknown>,
): Promise<InboxSendState> {
  // BOTH paths, and always. A refused send leaves the thread exactly as it was and
  // re-rendering it costs one read; an UNCONFIRMED one may have landed, and the
  // re-render is the only way the customer ever finds out. The list is revalidated
  // beside the thread because a reply that lands changes the row's preview and its
  // place in a list now ordered by time.
  revalidatePath(path)
  revalidatePath('/inbox')

  if (outcome.status === 'sent') {
    // Only here. The platform named the message, and its id is what makes the row
    // a record rather than a claim.
    if (record) await record(outcome.platformId)
    return { ok: true, platformId: outcome.platformId }
  }
  return { ok: false, status: outcome.status, message: outcome.message }
}

/**
 * Resolve everything a send needs, or the sentence explaining why it cannot happen.
 *
 * `scopedAccount` is reused from the read path rather than re-derived: it is the lookup
 * that proves this account belongs to the signed-in workspace, and doc 13 §3 is explicit
 * that a wrong `accountId` does not error — it acts on another customer's account and
 * returns 200. A second implementation of that check is a second chance to get it wrong.
 */
async function sendDeps(
  accountId: string,
): Promise<{ ok: true; deps: ReplyDeps; userId: string } | { ok: false; message: string }> {
  const { userId } = await auth()
  if (!userId) return { ok: false, message: 'Sign in to reply.' }

  const sends = zernioClientSends()
  if (sends === null) {
    return { ok: false, message: 'Replying is not available right now. Try again shortly.' }
  }

  const scoped = await scopedAccount(accountId)
  if (!scoped.ok) {
    // Deliberately one sentence for both `not_found` and every read failure: confirming
    // whether some other tenant's account id exists is itself a disclosure.
    return { ok: false, message: 'Sahoda could not open that account to reply from.' }
  }

  return {
    ok: true,
    userId,
    deps: {
      reads: scoped.reads,
      sends,
      profile: scoped.profile,
      account: scoped.account,
      // Stamped once, here, at the edge — so everything downstream is a pure function of
      // its inputs and the window decision can be tested without freezing a clock.
      now: new Date().toISOString(),
    },
  }
}

/**
 * Reply in a DM thread.
 *
 * `tag` arrives as `unknown` and is parsed, not trusted: it comes from a form. An
 * unparseable tag is refused here, and a tag this thread does not allow is refused
 * again by `authoriseReply` against the freshly-read window — the browser's view of
 * which tags were live may be hours stale.
 */
export async function sendThreadReply(
  accountId: string,
  conversationId: string,
  message: string,
  tag?: unknown,
  /**
   * One file from the customer's own library, named by id.
   *
   * An ID and never a url. A url parameter here would let this action send any
   * link on the internet into a conversation, under the customer's name — the
   * browser is not a place a tenancy decision can be made. `resolveAttachment`
   * reads the row inside the active workspace and mints the link itself.
   */
  attachment?: { assetId: string },
): Promise<InboxSendState> {
  try {
    const resolved = await sendDeps(accountId)
    if (!resolved.ok) return { ok: false, status: 'failed', message: resolved.message }

    let file: ResolvedAttachment | undefined
    if (attachment !== undefined) {
      const workspace = await activeWorkspaceRead()
      if (workspace.status !== 'ok') {
        return { ok: false, status: 'failed', message: 'Sahoda could not open your library.' }
      }
      const found = await resolveAttachment(workspace.workspace.id, attachment.assetId)
      // REFUSED, not failed, and nothing is sent: a file that is not this
      // workspace's is a statement about the request, not about the network. The
      // words are not sent on their own either — a reply that quietly lost its
      // photo reads on screen as a success.
      if (!found.ok) return { ok: false, status: 'refused', message: found.message }
      file = found.attachment
    }

    let intent: ReplyIntent = { kind: 'free_form' }
    if (tag !== undefined && tag !== null && tag !== '') {
      const parsed = MessageTagSchema.safeParse(tag)
      if (!parsed.success)
        return { ok: false, status: 'refused', message: 'That is not a message tag Sahoda knows.' }
      intent = { kind: 'tagged', tag: parsed.data }
    }

    const outcome = await performThreadReply(resolved.deps, {
      conversationId,
      message,
      intent,
      ...(file === undefined ? {} : { attachment: file }),
    })
    return await toState(outcome, threadHref({ accountId, conversationId }), (platformId) =>
      recordSentReply({
        accountId,
        kind: 'dm',
        platformThreadId: conversationId,
        body: message,
        platformMessageId: platformId,
        sentAt: resolved.deps.now,
        authorUserId: resolved.userId,
        ...(file === undefined ? {} : { attachments: [{ type: file.type, url: file.url }] }),
      }),
    )
  } catch (error) {
    reportServerError(error, { action: 'sendThreadReply' })
    return { ok: false, status: 'failed', message: 'Could not send that reply. Try again.' }
  }
}

/** Reply to a comment. `commentId` threads it under one; omitted, it sits on the post. */
export async function sendCommentReply(
  accountId: string,
  platformPostId: string,
  message: string,
  commentId?: string,
): Promise<InboxSendState> {
  try {
    const resolved = await sendDeps(accountId)
    if (!resolved.ok) return { ok: false, status: 'failed', message: resolved.message }

    const outcome = await performCommentReply(resolved.deps, {
      platformPostId,
      message,
      ...(commentId === undefined || commentId === '' ? {} : { commentId }),
    })
    return await toState(outcome, commentsHref({ accountId, platformPostId }), (platformId) =>
      recordSentReply({
        accountId,
        kind: 'comment',
        // THE THREAD IS THE POST, exactly as the webhook projector files it — so a
        // reply joins the comments already on that post rather than opening a row
        // beside them.
        platformThreadId: platformPostId,
        body: message,
        platformMessageId: platformId,
        sentAt: resolved.deps.now,
        authorUserId: resolved.userId,
      }),
    )
  } catch (error) {
    reportServerError(error, { action: 'sendCommentReply' })
    return { ok: false, status: 'failed', message: 'Could not send that reply. Try again.' }
  }
}

/**
 * Reply to a review.
 *
 * Unexercised end to end: no Google Business Profile has ever been connected to this
 * codebase, so the review row shape and this reply are both `[DOC]`. The path ships
 * because it is the one the first connected GBP will take — not because it has worked.
 */
export async function sendReviewReply(
  accountId: string,
  reviewId: string,
  message: string,
): Promise<InboxSendState> {
  try {
    const resolved = await sendDeps(accountId)
    if (!resolved.ok) return { ok: false, status: 'failed', message: resolved.message }

    const outcome = await performReviewReply(resolved.deps, { reviewId, message })
    return await toState(outcome, '/inbox/reviews', (platformId) =>
      recordSentReply({
        accountId,
        kind: 'review',
        platformThreadId: reviewId,
        body: message,
        platformMessageId: platformId,
        sentAt: resolved.deps.now,
        authorUserId: resolved.userId,
      }),
    )
  } catch (error) {
    reportServerError(error, { action: 'sendReviewReply' })
    return { ok: false, status: 'failed', message: 'Could not send that reply. Try again.' }
  }
}
