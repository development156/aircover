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
import { scopedAccount } from '@/lib/inbox/read'
import { reportServerError } from '@/lib/observability/report'
import { zernioClientSends } from '@/lib/zernio/server'

/**
 * Sending an inbox reply through Zernio: a DM, a comment, a review.
 *
 * ── WHY THIS IS A DIFFERENT FILE FROM `actions/inbox.ts` ─────────────────────
 * That one drafts into `inbox_messages`, the local FSD M7 tables, which ship empty and
 * have no ingest. This one talks to Zernio, where the conversations the customer can
 * actually see live. They are two different inboxes today and merging them would
 * suggest a link that does not exist.
 *
 * ── NOTHING IS RECORDED LOCALLY, AND THAT IS THE HONEST CHOICE ───────────────
 * A sent reply is NOT written to `inbox_messages`. Three reasons, in order of weight:
 *
 *  1. `inbox_threads.channel` is `check (channel in ('x','gbp','linkedin','instagram'))`
 *     — it cannot express facebook or whatsapp, which are two of the three platforms
 *     with a send window. Half the replies would be unrecordable.
 *  2. `inbox_threads` has no INSERT policy for `authenticated` at all, by design: a
 *     thread is something a platform told us about, not something a member may invent.
 *     There is no row to hang a message on.
 *  3. Nothing reads those tables. The thread view reads Zernio directly, so a row
 *     written here would be invisible — and a record nobody reads is worse than none,
 *     because it looks like provenance while proving nothing.
 *
 * So the RECEIPT is the record, and Zernio is the source of truth: after a confirmed
 * send the thread is revalidated and the reply comes back from the platform with its
 * own id. Widening that CHECK and adding a service_role writer is owed work for wt-db;
 * it is named in this lane's PR rather than done here, since only wt-db edits migrations.
 *
 * ── THE ID RULE SURVIVES THE ROUND TRIP ──────────────────────────────────────
 * `SendOutcome` has no branch that reports success without a platform id, and
 * `revalidatePath` runs ONLY on `sent`. An unconfirmed reply does not refresh the
 * thread, so the UI cannot show it arriving as though it had.
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
function toState(outcome: SendOutcome, path: string): InboxSendState {
  if (outcome.status === 'sent') {
    // Only here. The thread re-reads from Zernio and the reply returns carrying the id
    // the platform issued — which is the only evidence this codebase accepts.
    revalidatePath(path)
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
): Promise<{ ok: true; deps: ReplyDeps } | { ok: false; message: string }> {
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
): Promise<InboxSendState> {
  try {
    const resolved = await sendDeps(accountId)
    if (!resolved.ok) return { ok: false, status: 'failed', message: resolved.message }

    let intent: ReplyIntent = { kind: 'free_form' }
    if (tag !== undefined && tag !== null && tag !== '') {
      const parsed = MessageTagSchema.safeParse(tag)
      if (!parsed.success)
        return { ok: false, status: 'refused', message: 'That is not a message tag Sahoda knows.' }
      intent = { kind: 'tagged', tag: parsed.data }
    }

    const outcome = await performThreadReply(resolved.deps, { conversationId, message, intent })
    return toState(outcome, `/inbox/threads/${accountId}/${conversationId}`)
  } catch (error) {
    reportServerError(error, { action: 'sendThreadReply' })
    return { ok: false, status: 'failed', message: 'Could not send that reply — try again.' }
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
    return toState(outcome, `/inbox/comments/${accountId}/${platformPostId}`)
  } catch (error) {
    reportServerError(error, { action: 'sendCommentReply' })
    return { ok: false, status: 'failed', message: 'Could not send that reply — try again.' }
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
    return toState(outcome, '/inbox/reviews')
  } catch (error) {
    reportServerError(error, { action: 'sendReviewReply' })
    return { ok: false, status: 'failed', message: 'Could not send that reply — try again.' }
  }
}
