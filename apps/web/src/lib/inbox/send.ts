import type {
  ScopedAccountId,
  ScopedProfileId,
  ZernioReads,
  ZernioSends,
  ReplyReceipt,
} from '@sahoda/publishing'
import { authoriseReply, evaluateSendWindow, type ReplyIntent } from '@sahoda/shared'

import { newestInboundAt, threadPlatform } from '@/lib/inbox/messages'

/**
 * Sending a reply: the decisions, separated from the plumbing that resolves them.
 *
 * ── WHY THIS FILE IS NOT `server-only` ───────────────────────────────────────
 * Everything here is an ordinary function over injected ports. The server action in
 * `app/actions/inbox-send.ts` resolves the workspace, mints the scoped ids and builds
 * the two Zernio handles; this module then makes every decision that could be wrong.
 * That split is what makes the send path testable at all — the same reason
 * `lib/inbox/surface.ts` holds the read surface's judgement while `read.ts` holds its
 * I/O, and the same reason the adapters take an injected `Transport`.
 *
 * ── THE THREE OUTCOMES THAT ARE NOT "SENT" ARE NOT INTERCHANGEABLE ───────────
 * `refused` is a statement about the platform's window. `unconfirmed` means Zernio
 * accepted the reply and named nothing, so we cannot claim it landed. `failed` means we
 * never got an answer. Collapsing them would put "the window has closed" in front of a
 * customer whose window we simply failed to read.
 */

export interface ReplyDeps {
  /** Only the one read the send path needs — a handle that cannot list conversations. */
  reads: Pick<ZernioReads, 'listMessages'>
  sends: ZernioSends
  /** Doc 13 §3: required on every call, even where Zernio takes no profile filter. */
  profile: ScopedProfileId
  account: ScopedAccountId
  /** Passed in, never read from the clock, so the window decision stays a pure one. */
  now: string
}

export type SendOutcome =
  | { status: 'sent'; platformId: string }
  | { status: 'refused'; message: string }
  | { status: 'unconfirmed'; message: string }
  | { status: 'failed'; message: string }

/** One page is enough to find the newest inbound message — when it is the NEWEST page. */
const PAGE = 50

/**
 * An empty reply is a REFUSAL, not a failure.
 *
 * The transport throws on a blank message so a pointless round trip is never spent, but
 * that throw would land in `fromError` and tell the customer "Sahoda could not reach the
 * platform" — a false statement about the network, in a codebase whose whole discipline
 * is that status text must be true. Caught here instead, where it is one rule with a
 * test behind it rather than a second copy at an untestable boundary.
 */
function emptyReply(message: string): SendOutcome | null {
  if (message.trim() !== '') return null
  return { status: 'refused', message: 'Write a reply before sending it.' }
}

/**
 * Turn a receipt into an outcome.
 *
 * `sent` is reachable only through `receipt.sent === true`, which the publishing port
 * makes unconstructible without the platform's own id. So there is no path from here to
 * a green tick that is not backed by an identifier the platform issued — the `.is-real`
 * rule, expressed as control flow rather than as a reminder.
 */
function fromReceipt(receipt: ReplyReceipt): SendOutcome {
  if (receipt.sent) return { status: 'sent', platformId: receipt.platformId }
  return {
    status: 'unconfirmed',
    message:
      'Sahoda could not confirm this reply was delivered. The platform did not return an id for it. Check the conversation on the platform before sending again.',
  }
}

/**
 * One place that turns a thrown error into copy.
 *
 * The upstream message never reaches the DOM: a Zernio error can carry request context,
 * and an auth failure's text is the one place a key fragment could surface. The detail
 * goes to the server log; the customer gets a sentence they can act on.
 */
function fromError(error: unknown, what: string): SendOutcome {
  console.error(`[inbox] ${what} failed`, error instanceof Error ? error.message : 'unknown')
  return {
    status: 'failed',
    message: 'Sahoda could not reach the platform to send that reply. Try again in a moment.',
  }
}

/**
 * Reply in a DM thread, after re-deriving the send window from the current thread.
 *
 * ── THE RE-DERIVATION IS THE POINT ───────────────────────────────────────────
 * The affordance the page rendered is a hint with an expiry: a tab open across the
 * 24-hour boundary still shows a live compose box, and a `tagged` thread's HUMAN_AGENT
 * option lapses at 168h while it sits there. So the thread is read again, the window
 * re-evaluated against `now`, and `authoriseReply` asked — the same function the UI's
 * affordance came from, so a refusal here uses the same sentence the page would have.
 *
 * `sortOrder: 'desc'` is load-bearing, not a preference. Zernio's default is `asc`,
 * oldest-first, so an unsorted page of a long thread would not contain the newest
 * inbound message at all and the window would be computed from history.
 */
export async function replyToThread(
  deps: ReplyDeps,
  input: { conversationId: string; message: string; intent: ReplyIntent },
): Promise<SendOutcome> {
  const empty = emptyReply(input.message)
  if (empty) return empty

  let messages
  try {
    const page = await deps.reads.listMessages(deps.account, input.conversationId, {
      limit: PAGE,
      sortOrder: 'desc',
    })
    messages = page.messages
  } catch (error) {
    // NOT a refusal. Refusing would tell the customer the platform closed their window,
    // which is a claim about the platform we cannot make having never heard from it.
    return fromError(error, 'thread re-read before send')
  }

  const platform = threadPlatform(messages)
  if (platform === null) {
    // No platform means no modelled window. `evaluateSendWindow` would answer `unknown`
    // and `authoriseReply` would refuse — this branch only exists to say so in words
    // the customer can act on, since there is no thread-specific reason to quote.
    return {
      status: 'refused',
      message:
        'Sahoda could not tell which platform this thread belongs to, so it will not send a reply it cannot check the rules for. Reply from the platform’s own app.',
    }
  }

  const affordance = evaluateSendWindow({
    platform,
    lastInboundAt: newestInboundAt(messages),
    now: deps.now,
  })

  const authorisation = authoriseReply(affordance, input.intent)
  if (!authorisation.ok) {
    // The affordance's own sentence, verbatim. Composing a second explanation here is
    // how the page and the error end up telling the customer two different stories.
    return { status: 'refused', message: authorisation.reason }
  }

  try {
    const receipt = await deps.sends.sendMessage(deps.profile, deps.account, input.conversationId, {
      message: input.message,
      wire: authorisation.wire,
    })
    return fromReceipt(receipt)
  } catch (error) {
    return fromError(error, 'send message')
  }
}

/**
 * Reply to a comment on a post.
 *
 * No window is consulted, and that is deliberate rather than an omission: public
 * comments do not close after 24 hours, so running this through `evaluateSendWindow`
 * would invent a restriction the platform does not impose. Its real failure is a
 * submit-time 403 — this account may not comment on this post — which arrives as a
 * thrown `ZernioError` and is reported, not swallowed.
 */
export async function replyToComment(
  deps: ReplyDeps,
  input: { platformPostId: string; message: string; commentId?: string },
): Promise<SendOutcome> {
  const empty = emptyReply(input.message)
  if (empty) return empty

  try {
    const receipt = await deps.sends.replyToComment(
      deps.profile,
      deps.account,
      input.platformPostId,
      {
        message: input.message,
        ...(input.commentId === undefined ? {} : { commentId: input.commentId }),
      },
    )
    return fromReceipt(receipt)
  } catch (error) {
    return fromError(error, 'reply to comment')
  }
}

/**
 * Reply to a review.
 *
 * Reviews are `[DOC]` end to end: no Google Business Profile has ever been connected to
 * this codebase, so neither the row shape nor this reply has been observed. The surface
 * ships because the code path is the same one the first connected GBP will use, and an
 * empty state that says "nothing is connected" is honest today.
 */
export async function replyToReview(
  deps: ReplyDeps,
  input: { reviewId: string; message: string },
): Promise<SendOutcome> {
  const empty = emptyReply(input.message)
  if (empty) return empty

  try {
    const receipt = await deps.sends.replyToReview(deps.profile, deps.account, input.reviewId, {
      message: input.message,
    })
    return fromReceipt(receipt)
  } catch (error) {
    return fromError(error, 'reply to review')
  }
}
