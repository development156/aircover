import { describe, it, expect, vi } from 'vitest'
import type { ScopedAccountId, ScopedProfileId, ZernioMessage } from '@sahoda/publishing'

import { replyToComment, replyToReview, replyToThread, type ReplyDeps } from './send'

const PROFILE = '6a75cae32853ee463c6419d6' as ScopedProfileId
const ACCOUNT = '6a75caf7d0fe733d1afcc1f4' as ScopedAccountId

const T0 = '2026-08-08T00:00:00.000Z'
const at = (hours: number): string => new Date(Date.parse(T0) + hours * 3_600_000).toISOString()

const inbound = (createdAt: string, platform = 'instagram'): ZernioMessage =>
  ({
    id: `m-${createdAt}`,
    conversationId: 'conv-1',
    accountId: ACCOUNT,
    platform,
    message: 'Do you deliver?',
    senderId: 'cust-1',
    // The wire says `incoming`, not `inbound` — [LIVE 2026-08-10].
    direction: 'incoming',
    createdAt,
  }) as unknown as ZernioMessage

/**
 * A reads/sends pair whose behaviour each test states outright. Injected rather than
 * mocked at the module boundary so the orchestration below is an ordinary function:
 * the send path's decisions are the thing under test, and they must be checkable
 * without a Zernio key or a running server.
 */
function deps(overrides: {
  messages?: ZernioMessage[]
  sendResult?: Awaited<ReturnType<ReplyDeps['sends']['sendMessage']>>
  now?: string
  onSend?: (args: unknown[]) => void
}): ReplyDeps & { sendMessage: ReturnType<typeof vi.fn> } {
  const sendMessage = vi.fn(async (...args: unknown[]) => {
    overrides.onSend?.(args)
    return overrides.sendResult ?? { sent: true as const, platformId: 'mid.abc' }
  })

  return {
    profile: PROFILE,
    account: ACCOUNT,
    now: overrides.now ?? at(1),
    reads: {
      listMessages: vi.fn(async () => ({
        messages: overrides.messages ?? [inbound(T0)],
        pagination: { hasMore: false, nextCursor: null },
        sortOrderApplied: 'desc' as const,
      })),
    },
    sends: { sendMessage } as unknown as ReplyDeps['sends'],
    sendMessage,
  } as ReplyDeps & { sendMessage: ReturnType<typeof vi.fn> }
}

describe('replyToThread — the window is re-derived on the server, never trusted', () => {
  /**
   * The affordance the browser rendered has an expiry. A tab left open across the
   * 24-hour boundary still shows a live compose box, so the send path reads the thread
   * again and re-evaluates against the current clock. Without this, the whole
   * "explain, do not fail on submit" contract is decorative.
   */
  it('reads the thread again before sending', async () => {
    const d = deps({})
    await replyToThread(d, {
      conversationId: 'conv-1',
      message: 'Yes we do',
      intent: { kind: 'free_form' },
    })

    expect(d.reads.listMessages).toHaveBeenCalledOnce()
  })

  /**
   * `sortOrder: 'desc'` is not a preference. The API defaults to oldest-first, so an
   * unsorted read of a long thread computes the window from an ancient inbound message
   * and refuses a reply the platform would have accepted.
   */
  it('asks for the NEWEST page, because the window lives at the end of the thread', async () => {
    const d = deps({})
    await replyToThread(d, {
      conversationId: 'conv-1',
      message: 'Yes',
      intent: { kind: 'free_form' },
    })

    expect(d.reads.listMessages).toHaveBeenCalledWith(
      ACCOUNT,
      'conv-1',
      expect.objectContaining({ sortOrder: 'desc' }),
    )
  })

  it('sends with the profile first and no tag fields when the window is open', async () => {
    const seen: unknown[][] = []
    const d = deps({ onSend: (args) => seen.push(args) })

    const outcome = await replyToThread(d, {
      conversationId: 'conv-1',
      message: 'Yes we do',
      intent: { kind: 'free_form' },
    })

    expect(outcome).toEqual({ status: 'sent', platformId: 'mid.abc' })
    expect(seen[0]?.[0]).toBe(PROFILE)
    expect(seen[0]?.[1]).toBe(ACCOUNT)
    expect(seen[0]?.[3]).toEqual({ message: 'Yes we do', wire: {} })
  })

  it('carries the authorised tag once the free-form window has lapsed', async () => {
    const seen: unknown[][] = []
    const d = deps({ now: at(30), onSend: (args) => seen.push(args) })

    const outcome = await replyToThread(d, {
      conversationId: 'conv-1',
      message: 'Following up',
      intent: { kind: 'tagged', tag: 'HUMAN_AGENT' },
    })

    expect(outcome.status).toBe('sent')
    expect(seen[0]?.[3]).toEqual({
      message: 'Following up',
      wire: { messagingType: 'MESSAGE_TAG', messageTag: 'HUMAN_AGENT' },
    })
  })
})

describe('replyToThread — a refusal never reaches Zernio', () => {
  it('refuses a free-form reply on a lapsed window without calling send', async () => {
    const d = deps({ now: at(30) })

    const outcome = await replyToThread(d, {
      conversationId: 'conv-1',
      message: 'Hello?',
      intent: { kind: 'free_form' },
    })

    expect(outcome.status).toBe('refused')
    expect(d.sendMessage).not.toHaveBeenCalled()
  })

  it('refuses a tag the platform does not offer', async () => {
    const d = deps({ now: at(30) })

    const outcome = await replyToThread(d, {
      conversationId: 'conv-1',
      message: 'Hello?',
      intent: { kind: 'tagged', tag: 'ACCOUNT_UPDATE' },
    })

    expect(outcome.status).toBe('refused')
    if (outcome.status !== 'refused') throw new Error('unreachable')
    expect(outcome.message).toMatch(/ACCOUNT_UPDATE/)
    expect(d.sendMessage).not.toHaveBeenCalled()
  })

  it('refuses WhatsApp out of window — template-only is not a free-form send', async () => {
    const d = deps({ messages: [inbound(T0, 'whatsapp')], now: at(30) })

    const outcome = await replyToThread(d, {
      conversationId: 'conv-1',
      message: 'Your order is ready',
      intent: { kind: 'free_form' },
    })

    expect(outcome.status).toBe('refused')
    if (outcome.status !== 'refused') throw new Error('unreachable')
    expect(outcome.message).toMatch(/template/i)
    expect(d.sendMessage).not.toHaveBeenCalled()
  })

  /**
   * A thread whose messages name no platform we model yields no window at all. Sending
   * anyway would be the guess the affordance exists to avoid — and `unknown` refusing
   * is what keeps it a first-class state rather than a soft yes.
   */
  it('refuses when the thread states no platform we model', async () => {
    const d = deps({ messages: [inbound(T0, 'telegram')] })

    const outcome = await replyToThread(d, {
      conversationId: 'conv-1',
      message: 'Hi',
      intent: { kind: 'free_form' },
    })

    expect(outcome.status).toBe('refused')
    expect(d.sendMessage).not.toHaveBeenCalled()
  })

  it('refuses an empty thread rather than assuming the window is open', async () => {
    const d = deps({ messages: [] })

    const outcome = await replyToThread(d, {
      conversationId: 'conv-1',
      message: 'Hi',
      intent: { kind: 'free_form' },
    })

    expect(outcome.status).toBe('refused')
    expect(d.sendMessage).not.toHaveBeenCalled()
  })
})

describe('a reply is only recorded as sent when the platform named it', () => {
  /**
   * The `.is-real` rule. Zernio answers 200-with-no-id as a normal outcome, so this is
   * not an error path — it is the ordinary response that must not become a green tick.
   */
  it('reports unconfirmed, not sent, when no platform id came back', async () => {
    const d = deps({ sendResult: { sent: false, detail: 'no id' } })

    const outcome = await replyToThread(d, {
      conversationId: 'conv-1',
      message: 'Yes',
      intent: { kind: 'free_form' },
    })

    expect(outcome.status).toBe('unconfirmed')
    expect(outcome).not.toHaveProperty('platformId')
  })

  it('reports failed when the call itself threw, and never leaks the upstream text', async () => {
    const d = deps({})
    d.sends.sendMessage = vi.fn(async () => {
      throw new Error('Bearer sk_secret was rejected by upstream')
    }) as unknown as ReplyDeps['sends']['sendMessage']

    const outcome = await replyToThread(d, {
      conversationId: 'conv-1',
      message: 'Yes',
      intent: { kind: 'free_form' },
    })

    expect(outcome.status).toBe('failed')
    if (outcome.status !== 'failed') throw new Error('unreachable')
    expect(outcome.message).not.toContain('sk_')
  })

  it('reports failed when the thread could not be read at all', async () => {
    const d = deps({})
    d.reads.listMessages = vi.fn(async () => {
      throw new Error('upstream 500')
    }) as unknown as ReplyDeps['reads']['listMessages']

    const outcome = await replyToThread(d, {
      conversationId: 'conv-1',
      message: 'Yes',
      intent: { kind: 'free_form' },
    })

    // NOT refused: refusing would tell the customer the platform closed the window,
    // which is a claim we cannot support when we never learned what the window was.
    expect(outcome.status).toBe('failed')
    expect(d.sendMessage).not.toHaveBeenCalled()
  })
})

describe('comment and review replies — no window, same id rule', () => {
  const commentDeps = (
    result: { sent: true; platformId: string } | { sent: false; detail: string },
  ) => {
    const replyToCommentFn = vi.fn(async () => result)
    const replyToReviewFn = vi.fn(async () => result)
    return {
      profile: PROFILE,
      account: ACCOUNT,
      now: at(1),
      reads: { listMessages: vi.fn() },
      sends: {
        replyToComment: replyToCommentFn,
        replyToReview: replyToReviewFn,
      },
      replyToCommentFn,
      replyToReviewFn,
    } as unknown as ReplyDeps & {
      replyToCommentFn: ReturnType<typeof vi.fn>
      replyToReviewFn: ReturnType<typeof vi.fn>
    }
  }

  /**
   * A public comment has no 24-hour window — the platforms do not close them — so
   * routing it through `evaluateSendWindow` would invent a restriction. Its real
   * failure is a submit-time 403 (this account may not comment on this post), which is
   * reported rather than swallowed.
   */
  it('does not read the thread or consult a send window', async () => {
    const d = commentDeps({ sent: true, platformId: '17901' })
    const outcome = await replyToComment(d, { platformPostId: 'p-1', message: 'Thank you!' })

    expect(outcome).toEqual({ status: 'sent', platformId: '17901' })
    expect(d.reads.listMessages).not.toHaveBeenCalled()
  })

  it('passes the profile first, then the account', async () => {
    const d = commentDeps({ sent: true, platformId: '17901' })
    await replyToComment(d, { platformPostId: 'p-1', message: 'Thanks', commentId: '17900' })

    expect(d.replyToCommentFn).toHaveBeenCalledWith(PROFILE, ACCOUNT, 'p-1', {
      message: 'Thanks',
      commentId: '17900',
    })
  })

  it('reports a comment reply with no id as unconfirmed', async () => {
    const d = commentDeps({ sent: false, detail: 'no id' })
    const outcome = await replyToComment(d, { platformPostId: 'p-1', message: 'Thanks' })

    expect(outcome.status).toBe('unconfirmed')
  })

  it('sends a review reply with the profile first', async () => {
    const d = commentDeps({ sent: true, platformId: 'reply-1' })
    const outcome = await replyToReview(d, {
      reviewId: 'accounts/1/locations/2/reviews/3',
      message: 'Thank you',
    })

    expect(outcome).toEqual({ status: 'sent', platformId: 'reply-1' })
    expect(d.replyToReviewFn).toHaveBeenCalledWith(
      PROFILE,
      ACCOUNT,
      'accounts/1/locations/2/reviews/3',
      { message: 'Thank you' },
    )
  })

  it('reports a review reply with no id as unconfirmed', async () => {
    const d = commentDeps({ sent: false, detail: 'no id' })
    const outcome = await replyToReview(d, { reviewId: 'r-1', message: 'Thanks' })

    expect(outcome.status).toBe('unconfirmed')
  })
})
