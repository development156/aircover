import { describe, it, expect } from 'vitest'

import { createZernioSends } from './sends'
import { scopeAccount, scopeProfile } from './scope'
import { ZernioError } from './client'
import type { Transport, TransportRequest } from '../transport'

const WS = '5f17dad6-35ae-4288-aba1-1e3a4df31189'
const PROFILE = '6a75cae32853ee463c6419d6'
const ACCOUNT = '6a75caf7d0fe733d1afcc1f4'
const API_KEY = 'sk_0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'

const profile = scopeProfile({ workspace_id: WS, profile_id: PROFILE }, WS)
const account = scopeAccount(
  { workspace_id: WS, external_account: { id: ACCOUNT, profileId: PROFILE } },
  WS,
  profile,
)

/**
 * ── EVERY RESPONSE BODY IN THIS FILE IS SYNTHETIC `[DOC]` ────────────────────
 * They are authored from the OpenAPI spec (`docs.zernio.com/api/openapi`, the
 * `sendInboxMessage` / `replyToInboxPost` / `replyToInboxReview` operations). No reply
 * has ever been sent through Zernio from this codebase, so nothing here is `[LIVE]`.
 *
 * Doc 13 §0 makes that distinction a hard rule, so these live inline rather than in
 * `fixtures/zernio-inbox/`, which holds real captures pinned by `inbox-live.test.ts`.
 * A synthetic body sitting in that directory would become indistinguishable from a
 * recording the first time somebody went looking for one.
 */
function capturing(
  body: unknown,
  status = 200,
): { transport: Transport; last: () => TransportRequest } {
  let last: TransportRequest | undefined
  const transport: Transport = async (req) => {
    last = req
    return {
      status,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }
  }
  return {
    transport,
    last: () => {
      if (!last) throw new Error('no request was made')
      return last
    },
  }
}

const sendsWith = (body: unknown, status = 200) => {
  const cap = capturing(body, status)
  return { sends: createZernioSends({ transport: cap.transport, apiKey: API_KEY }), cap }
}

const bodyOf = (req: TransportRequest): Record<string, unknown> =>
  JSON.parse(String(req.body)) as Record<string, unknown>

describe('sendMessage — the DM reply', () => {
  it('posts to the conversation messages endpoint with the account in the body', async () => {
    const { sends, cap } = sendsWith({ success: true, data: { messageId: 'mid.abc123' } })
    await sends.sendMessage(profile, account, 'conv-1', { message: 'On our way' })

    const req = cap.last()
    expect(req.method).toBe('POST')
    expect(req.url).toBe('https://zernio.com/api/v1/inbox/conversations/conv-1/messages')
    expect(bodyOf(req)).toEqual({ accountId: ACCOUNT, message: 'On our way' })
  })

  it('encodes a conversation id that is not URL-safe', async () => {
    const { sends, cap } = sendsWith({ success: true, data: { messageId: 'mid.abc' } })
    await sends.sendMessage(profile, account, 't_100/200', { message: 'hi' })

    expect(cap.last().url).toContain('/inbox/conversations/t_100%2F200/messages')
  })

  it('returns the platform message id as the receipt', async () => {
    const { sends } = sendsWith({ success: true, data: { messageId: 'mid.abc123' } })
    const receipt = await sends.sendMessage(profile, account, 'conv-1', { message: 'hi' })

    expect(receipt).toEqual({ sent: true, platformId: 'mid.abc123' })
  })

  /**
   * ── THE RULE THIS FILE EXISTS FOR ────────────────────────────────────────────
   * A 200 is not proof. The spec says `messageId` is "not returned for Reddit", which
   * means Zernio answers 200-with-no-id as a NORMAL outcome, not an error. Treating
   * that as sent would put a reply in the thread that may never have reached anybody —
   * the same fabrication `.is-real` forbids on publish, where a post is real only when
   * `platformPostUrl` names it.
   */
  it('does NOT report a send when the response names no message id', async () => {
    const { sends } = sendsWith({ success: true, data: { message: 'ok' } })
    const receipt = await sends.sendMessage(profile, account, 'conv-1', { message: 'hi' })

    expect(receipt.sent).toBe(false)
    if (receipt.sent) throw new Error('unreachable')
    expect(receipt.detail).toMatch(/id/i)
  })

  it('does NOT report a send when data is absent altogether', async () => {
    const { sends } = sendsWith({ success: true })
    expect((await sends.sendMessage(profile, account, 'c', { message: 'hi' })).sent).toBe(false)
  })

  it('does NOT report a send when the id is an empty string', async () => {
    const { sends } = sendsWith({ success: true, data: { messageId: '' } })
    expect((await sends.sendMessage(profile, account, 'c', { message: 'hi' })).sent).toBe(false)
  })

  it('carries the tag fields when the window requires them', async () => {
    const { sends, cap } = sendsWith({ success: true, data: { messageId: 'mid.x' } })
    await sends.sendMessage(profile, account, 'conv-1', {
      message: 'Following up',
      wire: { messagingType: 'MESSAGE_TAG', messageTag: 'HUMAN_AGENT' },
    })

    expect(bodyOf(cap.last())).toEqual({
      accountId: ACCOUNT,
      message: 'Following up',
      messagingType: 'MESSAGE_TAG',
      messageTag: 'HUMAN_AGENT',
    })
  })

  it('sends no tag fields at all when the window is open', async () => {
    const { sends, cap } = sendsWith({ success: true, data: { messageId: 'mid.x' } })
    await sends.sendMessage(profile, account, 'conv-1', { message: 'hi', wire: {} })

    expect(Object.keys(bodyOf(cap.last())).sort()).toEqual(['accountId', 'message'])
  })

  it('refuses an empty message locally rather than spending a round trip on a 400', async () => {
    const { sends } = sendsWith({ success: true, data: { messageId: 'mid.x' } })
    await expect(sends.sendMessage(profile, account, 'c', { message: '   ' })).rejects.toThrow(
      /empty/i,
    )
  })
})

describe('replyToComment — the public reply under a post', () => {
  it('posts to the comments endpoint for the platform post id', async () => {
    const { sends, cap } = sendsWith({ success: true, data: { commentId: '17900', isReply: true } })
    await sends.replyToComment(profile, account, '18104441855596739', { message: 'Thank you!' })

    const req = cap.last()
    expect(req.method).toBe('POST')
    expect(req.url).toBe('https://zernio.com/api/v1/inbox/comments/18104441855596739')
    expect(bodyOf(req)).toEqual({ accountId: ACCOUNT, message: 'Thank you!' })
  })

  it('threads under a specific comment when one is named', async () => {
    const { sends, cap } = sendsWith({ success: true, data: { commentId: '17901' } })
    await sends.replyToComment(profile, account, 'post-1', {
      message: 'Thanks',
      commentId: '17900',
    })

    expect(bodyOf(cap.last()).commentId).toBe('17900')
  })

  it('returns the new comment id as the receipt', async () => {
    const { sends } = sendsWith({ success: true, data: { commentId: '17901', isReply: true } })
    const receipt = await sends.replyToComment(profile, account, 'post-1', { message: 'Thanks' })

    expect(receipt).toEqual({ sent: true, platformId: '17901' })
  })

  it('does NOT report a send when no comment id came back', async () => {
    const { sends } = sendsWith({ success: true, data: { isReply: true } })
    expect((await sends.replyToComment(profile, account, 'p', { message: 'x' })).sent).toBe(false)
  })

  /**
   * A 403 here is a real and specific outcome: the connected account may not be
   * permitted to comment on this post. It throws rather than resolving to an
   * unconfirmed receipt, because "the platform refused" and "the platform said nothing"
   * are different facts and the copy layer says different things about them.
   */
  it('throws on a 403 rather than swallowing it into a receipt', async () => {
    const { sends } = sendsWith(
      { error: 'Not permitted to comment', type: 'platform_error', code: 'platform_api_error' },
      403,
    )

    await expect(
      sends.replyToComment(profile, account, 'post-1', { message: 'Thanks' }),
    ).rejects.toBeInstanceOf(ZernioError)
  })
})

describe('replyToReview — Google Business and Facebook', () => {
  /**
   * GBP review ids are full resource names —
   * `accounts/{a}/locations/{l}/reviews/{r}` — so the id contains slashes and MUST be
   * encoded. Unencoded it silently addresses a different path, which is the class of
   * failure that returns 200 from an HTML catch-all (doc 13 §2.1).
   */
  it('URL-encodes a Google Business review resource name', async () => {
    const { sends, cap } = sendsWith({
      status: 'ok',
      reply: { id: 'reply-1', text: 'Thanks!', created: '2026-08-11T10:00:00.000Z' },
      platform: 'googlebusiness',
    })
    await sends.replyToReview(profile, account, 'accounts/111/locations/222/reviews/333', {
      message: 'Thank you',
    })

    const req = cap.last()
    expect(req.url).toBe(
      'https://zernio.com/api/v1/inbox/reviews/accounts%2F111%2Flocations%2F222%2Freviews%2F333/reply',
    )
    expect(bodyOf(req)).toEqual({ accountId: ACCOUNT, message: 'Thank you' })
  })

  /**
   * A THIRD envelope shape. Messages answer `data.messageId`, comments `data.commentId`,
   * and reviews have no `data` and no `success` — the id is at `reply.id`. Reading them
   * with one shared accessor would resolve to undefined here and report every review
   * reply as unconfirmed.
   */
  it('reads the id out of the review envelope, which has no data wrapper', async () => {
    const { sends } = sendsWith({
      status: 'ok',
      reply: { id: 'reply-1', text: 'Thanks!', created: '2026-08-11T10:00:00.000Z' },
    })
    const receipt = await sends.replyToReview(profile, account, 'r-1', { message: 'Thank you' })

    expect(receipt).toEqual({ sent: true, platformId: 'reply-1' })
  })

  it('does NOT report a send when the reply carries no id', async () => {
    const { sends } = sendsWith({ status: 'ok', reply: { text: 'Thanks!' } })
    expect((await sends.replyToReview(profile, account, 'r-1', { message: 'x' })).sent).toBe(false)
  })

  it('does NOT report a send on a bare status:ok with no reply at all', async () => {
    const { sends } = sendsWith({ status: 'ok' })
    expect((await sends.replyToReview(profile, account, 'r-1', { message: 'x' })).sent).toBe(false)
  })
})

describe('the tenant boundary is a parameter list, not a convention', () => {
  /**
   * Doc 13 §3: Zernio validates `accountId` against the whole TEAM, not against the
   * profile in the request. A wrong id does not error — it replies on another
   * customer's Instagram and returns 200. On a read that leaks; on a send it publishes
   * words in someone else's voice.
   *
   * So `profile` is the first parameter of every send. It is not put on the wire —
   * these endpoints take no profile filter — it is proof that the caller resolved the
   * workspace before addressing anybody, and `scopeAccount` cannot mint the account
   * without it. The @ts-expect-error lines below are checked by `pnpm typecheck`; that
   * gate is what makes "omission is a compile error" a verified claim rather than a
   * comment.
   */
  /**
   * ── DELIBERATELY NEVER CALLED ────────────────────────────────────────────────
   * These are assertions for `tsc`, not for vitest. Each `@ts-expect-error` fails the
   * `typecheck` gate if the call it sits on ever becomes legal — which is the whole
   * claim. Running them would only prove that a malformed call throws at runtime, a
   * weaker and different fact, so the body sits inside a function nothing invokes.
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async function typeOnlyAssertions(sends: ReturnType<typeof createZernioSends>) {
    // @ts-expect-error — profile is required and first; a bare account is not enough.
    await sends.sendMessage(account, 'conv-1', { message: 'hi' })
    // @ts-expect-error — same rule on the comment reply.
    await sends.replyToComment(account, 'post-1', { message: 'hi' })
    // @ts-expect-error — and on the review reply.
    await sends.replyToReview(account, 'r-1', { message: 'hi' })
    // @ts-expect-error — only scopeAccount can mint this; a raw id string is refused.
    await sends.sendMessage(profile, ACCOUNT, 'conv-1', { message: 'hi' })
  }

  it('exposes a send surface whose scoped parameters are checked at compile time', () => {
    // The proof is `typeOnlyAssertions` above, verified by `pnpm typecheck`. This case
    // exists so the claim is visible in the test report rather than only in a comment.
    expect(typeof typeOnlyAssertions).toBe('function')
  })

  it('never puts the api key in an error message', async () => {
    const { sends } = sendsWith({ error: 'nope', type: 'auth_error', code: 'UNAUTHORIZED' }, 401)

    await expect(sends.sendMessage(profile, account, 'c', { message: 'hi' })).rejects.toThrow(
      expect.objectContaining({
        message: expect.not.stringContaining('sk_'),
      }) as Error,
    )
  })

  /**
   * The api.zernio.com defence, inherited rather than re-derived: an HTML 200 must be an
   * error on the write path too. A send that "succeeded" against a Next.js shell would
   * be the worst possible version of this bug.
   */
  it('refuses an HTML 200 instead of reading it as a send', async () => {
    const transport: Transport = async () => ({
      status: 200,
      headers: { 'content-type': 'text/html' },
      body: '<!doctype html><html></html>',
    })
    const sends = createZernioSends({ transport, apiKey: API_KEY })

    await expect(sends.sendMessage(profile, account, 'c', { message: 'hi' })).rejects.toThrow(
      /not the Zernio API/,
    )
  })
})
