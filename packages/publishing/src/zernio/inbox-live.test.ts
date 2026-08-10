import { describe, expect, it, vi } from 'vitest'

import { createZernioReads, messageDirection } from './reads'
import { scopeAccount, scopeProfile } from './scope'
import type { Transport } from '../transport'

import conversationsFixture from '../../fixtures/zernio-inbox/conversations.list.json'
import messagesFixture from '../../fixtures/zernio-inbox/messages.instagram.json'
import commentedPostsFixture from '../../fixtures/zernio-inbox/comments.commented-posts.json'
import postCommentsFixture from '../../fixtures/zernio-inbox/comments.post.json'
import reviewsFixture from '../../fixtures/zernio-inbox/reviews.none-connected.json'

/**
 * The `/inbox/*` surface, tested against payloads Zernio actually sent.
 *
 * ── WHY THESE FIXTURES ARE NOT HAND-WRITTEN ──────────────────────────────────
 * Every file under `fixtures/zernio-inbox/` is a verbatim capture from
 * `https://zernio.com/api/v1` on **2026-08-10**, against profile
 * `6a75cae32853ee463c6419d6` / account `6a75caf7d0fe733d1afcc1f4` (`@testingg53`),
 * scrubbed only of one real participant's name, avatar URLs and their direct-thread
 * link. Ids, timestamps, enum values and structural keys are untouched.
 *
 * That provenance is the point. The tests these replace built their own fixtures from
 * the same assumption the implementation made — `direction: 'inbound'` — so they passed
 * against code that could never work, and said so in a comment instead of failing.
 * A fixture invented alongside the code it tests proves only that the two agree.
 */

const PROFILE = scopeProfile({ workspace_id: 'w-1', profile_id: '6a75cae32853ee463c6419d6' }, 'w-1')
const ACCOUNT = scopeAccount(
  {
    workspace_id: 'w-1',
    external_account: { id: '6a75caf7d0fe733d1afcc1f4', profileId: '6a75cae32853ee463c6419d6' },
  },
  'w-1',
  PROFILE,
)

const serving =
  (body: unknown): Transport =>
  async () => ({
    status: 200,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })

const readsServing = (body: unknown) =>
  createZernioReads({ transport: serving(body), apiKey: 'sk_test' })

describe('direction: Zernio says incoming/outgoing, never inbound', () => {
  /**
   * The defect this file exists for. `[LIVE 2026-08-10]`: a real Instagram thread
   * carries `"outgoing"` and `"incoming"`. Doc 13 recorded no messaging behaviour at
   * all, and `'inbound'` — the value both the send-window and the message list matched
   * on — appears nowhere in a real payload.
   */
  it('reads the real thread as one message each way', async () => {
    const reads = readsServing(messagesFixture)
    const { messages } = await reads.listMessages(ACCOUNT, '1580525030139202')

    expect(messages.map((m) => m.direction)).toEqual(['outgoing', 'incoming'])
    expect(messages.map((m) => messageDirection(m))).toEqual(['outbound', 'inbound'])
  })

  it('tolerates the documented spelling without having observed it', () => {
    // `'inbound'`/`'outbound'` is doc 13's vocabulary and our own `inbox_messages`
    // enum. Accepting both costs nothing and neither token can be confused for its
    // opposite; the risk worth guarding is an UNSEEN third spelling, below.
    expect(messageDirection({ direction: 'inbound' })).toBe('inbound')
    expect(messageDirection({ direction: 'outbound' })).toBe('outbound')
  })

  it('reports an unrecognised direction instead of silently calling it ours', () => {
    // Instagram is the only platform observed. If Facebook or WhatsApp emit a third
    // spelling, strict and permissive matching both fail — the difference is whether
    // anyone finds out. `unknown` never opens a send window, and the log is what turns
    // "wrong forever" into "wrong until the first Facebook thread".
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(messageDirection({ direction: 'received' })).toBe('unknown')
    expect(spy).toHaveBeenCalled()
    spy.mockRestore()
  })

  it('treats an absent direction as unknown, not as ours', () => {
    expect(messageDirection({})).toBe('unknown')
  })
})

describe('accountId is the same id space the connections table stores', () => {
  /**
   * `[LIVE 2026-08-10]` — the question `apps/web/REQUESTS.md` raised and
   * `lib/zernio/scope.ts` carried as `[DOC]`. Had these differed, the lists would have
   * rendered perfectly and every row would have 404'd, reading as a routing bug.
   *
   * `GET /accounts?profileId=…` reports `_id: "6a75caf7d0fe733d1afcc1f4"`, which is what
   * the OAuth return writes into `connections.external_account->>'id'`. Both inbox row
   * types report that same value.
   */
  const ACCOUNT_ID = '6a75caf7d0fe733d1afcc1f4'

  it('reports the account _id on a conversation row', async () => {
    const page = await readsServing(conversationsFixture).listConversations(PROFILE)
    expect(page.data).not.toHaveLength(0)
    for (const row of page.data) expect(row.accountId).toBe(ACCOUNT_ID)
  })

  it('reports the account _id on a commented-post row', async () => {
    // The sibling. A fix that closed conversations and left this one is the exact
    // defect class this repo has shipped before.
    const page = await readsServing(commentedPostsFixture).listCommentedPosts(PROFILE)
    expect(page.data).not.toHaveLength(0)
    for (const row of page.data) expect(row.accountId).toBe(ACCOUNT_ID)
  })

  it('reports the account _id on a message row', async () => {
    const { messages } = await readsServing(messagesFixture).listMessages(ACCOUNT, 'c-1')
    for (const m of messages) expect(m.accountId).toBe(ACCOUNT_ID)
  })
})

describe('pagination is not the same shape on every /inbox/* endpoint', () => {
  /**
   * `[LIVE 2026-08-10]`: `/inbox/comments/{postId}` answers `{"hasMore": false}` — the
   * `pagination` OBJECT is present and the `nextCursor` FIELD is missing. A
   * `data.pagination ?? EMPTY_CURSOR` default only fires when the object is absent, so
   * `undefined` flowed out through a field typed `string | null`.
   */
  it('normalises a pagination object that omits nextCursor', async () => {
    expect(postCommentsFixture.pagination).not.toHaveProperty('nextCursor')

    const page = await readsServing(postCommentsFixture).listPostComments(
      ACCOUNT,
      '18277022635290264',
    )
    expect(page.pagination.nextCursor).toBeNull()
    expect(page.pagination.hasMore).toBe(false)
  })

  it('keeps a real cursor when one is sent', async () => {
    const page = await readsServing({
      comments: [],
      pagination: { hasMore: true, nextCursor: 'CUR' },
    }).listPostComments(ACCOUNT, 'p-1')
    expect(page.pagination).toEqual({ hasMore: true, nextCursor: 'CUR' })
  })

  it('carries the list cursor through on the surfaces that send one', async () => {
    const page = await readsServing(conversationsFixture).listConversations(PROFILE)
    expect(page.pagination).toEqual({ hasMore: false, nextCursor: null })
  })
})

describe('per-account meta is only on the fan-out lists', () => {
  /**
   * `reads.ts` claimed `ZernioInboxMeta` rode on "every `/inbox/*` response". `[LIVE
   * 2026-08-10]` contradicts that: the two account-scoped endpoints answer differently.
   */
  it('carries accountsQueried/accountsFailed on a profile-scoped list', async () => {
    const page = await readsServing(conversationsFixture).listConversations(PROFILE)
    expect(page.meta?.accountsFailed).toBe(0)
    expect(page.meta?.failedAccounts).toEqual([])
  })

  it('reports accountsQueried 0 when nothing feeds the surface', async () => {
    // The reviews path, live: no Google Business Profile has ever been connected, so
    // Zernio queried nobody. `classifyInboxResult` turns this into "connect an account",
    // never into "no reviews" — a measurement we never took.
    const page = await readsServing(reviewsFixture).listReviews(PROFILE)
    expect(page.data).toHaveLength(0)
    expect(page.meta?.accountsQueried).toBe(0)
  })

  it('sends no ZernioInboxMeta at all on a thread read', () => {
    expect(messagesFixture).not.toHaveProperty('meta')
  })

  it('sends a DIFFERENT meta shape on a post-comments read', () => {
    // {platform, postId, accountId, lastUpdated} — no accountsQueried, no failedAccounts.
    // Reading it as ZernioInboxMeta would make accountsQueried undefined and send the
    // classifier down its "cannot confirm" branch forever.
    expect(postCommentsFixture.meta).not.toHaveProperty('accountsQueried')
    expect(postCommentsFixture.meta).toHaveProperty('postId')
  })
})

describe('/inbox/comments lists every post, not only posts with comments', () => {
  /**
   * `[LIVE 2026-08-10]`: six posts came back and exactly one carried comments. The
   * endpoint's name and our own comment both said "posts that have comments"; neither
   * is what it returns.
   */
  it('returns rows whose commentCount is 0', async () => {
    const page = await readsServing(commentedPostsFixture).listCommentedPosts(PROFILE)
    expect(page.data.length).toBeGreaterThan(1)
    expect(page.data.filter((p) => p.commentCount === 0).length).toBeGreaterThan(0)
    expect(page.data.filter((p) => p.commentCount > 0)).toHaveLength(1)
  })

  it('returns a published post whose caption is the empty string', async () => {
    // Not null, not undefined — `""`. A `?? 'no caption'` fallback never fires on it.
    const page = await readsServing(commentedPostsFixture).listCommentedPosts(PROFILE)
    expect(page.data.some((p) => p.content === '')).toBe(true)
  })
})
