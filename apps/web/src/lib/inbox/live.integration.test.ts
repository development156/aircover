import {
  createZernioReads,
  messageDirection,
  scopeAccount,
  scopeProfile,
} from '@sahoda/publishing'
import { evaluateSendWindow } from '@sahoda/shared'
import { describe, expect, it } from 'vitest'

import { postsCarryingComments } from './commented-posts'
import { INBOX_SURFACES, classifyInboxResult } from './emptiness'
import { newestInboundAt, threadPlatform } from './messages'

/**
 * The inbox read path, against the real Zernio API.
 *
 * ── WHY THIS EXISTS ON TOP OF THE FIXTURES ───────────────────────────────────
 * `packages/publishing/src/zernio/inbox-live.test.ts` proves we parse the payloads we
 * captured. It cannot notice Zernio changing them. Every defect this suite was written
 * for — `direction`, the missing `nextCursor`, `/inbox/comments` returning every post —
 * was a shape assumption that held in our heads and nowhere else, for weeks, because
 * nothing ever asked the real thing.
 *
 * ── WHY IT IS OPT-IN AND NOT MERELY KEY-GATED ────────────────────────────────
 * `ZERNIO_API_KEY` is present in every local `.env`, so gating on the key would put
 * ~7 network calls in every `turbo test` — against a 60/min rate limit, and flaky by
 * construction. `ZERNIO_LIVE_INBOX=1` makes running it a decision. The cloud sandbox has
 * no `.env` and skips this either way, which is expected and not a failure.
 *
 *     ZERNIO_LIVE_INBOX=1 pnpm --filter @sahoda/web vitest run src/lib/inbox/live
 *
 * Pinned to the workspace that first published: profile `6a75cae32853ee463c6419d6`,
 * Instagram account `6a75caf7d0fe733d1afcc1f4` (`@testingg53`).
 */

const LIVE = process.env.ZERNIO_LIVE_INBOX === '1' && Boolean(process.env.ZERNIO_API_KEY)

const WORKSPACE = 'live-verification'
const PROFILE_ID = '6a75cae32853ee463c6419d6'
const ACCOUNT_ID = '6a75caf7d0fe733d1afcc1f4'

const profile = scopeProfile({ workspace_id: WORKSPACE, profile_id: PROFILE_ID }, WORKSPACE)
const account = scopeAccount(
  { workspace_id: WORKSPACE, external_account: { id: ACCOUNT_ID, profileId: PROFILE_ID } },
  WORKSPACE,
  profile,
)

const reads = () =>
  createZernioReads({
    apiKey: process.env.ZERNIO_API_KEY ?? '',
    transport: async (req) => {
      const res = await fetch(req.url, {
        method: req.method,
        headers: req.headers,
        ...(req.body === undefined ? {} : { body: req.body as BodyInit }),
      })
      return {
        status: res.status,
        headers: Object.fromEntries(res.headers.entries()),
        body: await res.text(),
      }
    },
  })

describe.skipIf(!LIVE)('the inbox read path against the live Zernio API', () => {
  it('resolves a thread through the account-id join and reads both directions', async () => {
    const convos = await reads().listConversations(profile, { limit: 50 })
    const row = convos.data[0]
    expect(row, 'no conversation to verify against').toBeDefined()

    // The id-space question. A mismatch here 404s every thread link while the list
    // renders perfectly, which reads as a routing bug rather than an id error.
    expect(row!.accountId).toBe(ACCOUNT_ID)

    const thread = await reads().listMessages(account, row!.id, { limit: 50 })
    expect(thread.messages.length).toBeGreaterThan(0)

    // Zernio's own vocabulary, mapped. `'inbound'` — what we shipped against — appears
    // nowhere, which is why every affordance below used to be `unknown`.
    const classified = thread.messages.map(messageDirection)
    expect(classified).toContain('inbound')
    expect(classified).not.toContain('unknown')

    const lastInboundAt = newestInboundAt(thread.messages)
    expect(lastInboundAt).not.toBeNull()

    const platform = threadPlatform(thread.messages)
    expect(platform).not.toBeNull()
    const affordance = evaluateSendWindow({
      platform: platform!,
      lastInboundAt,
      now: new Date().toISOString(),
    })
    // A definite answer either way. `unknown` here is the regression.
    expect(affordance.state).not.toBe('unknown')

    // And what the PAGE says about that read. `/messages` carries no `ZernioInboxMeta`
    // and never will — there is no fan-out on a single-account read — so without
    // `fanOut: false` this fell into the "could not confirm every account answered"
    // branch and `SurfaceBanner` rendered a live warning over a read that succeeded.
    const decision = classifyInboxResult({
      rows: thread.messages.length,
      meta: undefined,
      surface: INBOX_SURFACES.thread,
      connectedAccounts: 1,
      fanOut: false,
    })
    expect(decision.state).toBe('ok')
    expect(decision.headline).not.toMatch(/could not confirm/i)
  })

  it('shows only comment-carrying posts and never prints Zernio’s account count', async () => {
    const posts = await reads().listCommentedPosts(profile, { limit: 50 })
    const view = postsCarryingComments(posts.data)
    expect(view.posts.length).toBeLessThanOrEqual(posts.data.length)
    for (const p of view.posts) expect(p.commentCount).toBeGreaterThan(0)

    const state = classifyInboxResult({
      rows: view.posts.length,
      meta: posts.meta,
      surface: INBOX_SURFACES.comments,
      connectedAccounts: 1,
      hasMore: posts.pagination.hasMore,
    })
    // `accountsQueried` has been observed at 2 for a one-account key; it must not reach
    // the customer as a count of THEIR accounts.
    expect(state.body).not.toMatch(/\d+ connected account/)
  })

  it('normalises the post-comments pagination that omits nextCursor', async () => {
    const posts = await reads().listCommentedPosts(profile, { limit: 50 })
    const withComments = postsCarryingComments(posts.data).posts[0]
    expect(withComments, 'no commented post to verify against').toBeDefined()

    const page = await reads().listPostComments(account, withComments!.id, { limit: 50 })
    expect(page.pagination.nextCursor).toBeNull()
    expect(typeof page.pagination.hasMore).toBe('boolean')
    expect(page.comments.length).toBeGreaterThan(0)

    // Same single-account rule as the thread: this endpoint's `meta` is
    // {platform, postId, accountId, lastUpdated} and carries no `accountsQueried`.
    const decision = classifyInboxResult({
      rows: page.comments.length,
      meta: undefined,
      surface: INBOX_SURFACES.comments,
      connectedAccounts: 1,
      fanOut: false,
    })
    expect(decision.state).toBe('ok')
    expect(decision.headline).not.toMatch(/could not confirm/i)
  })

  it('never claims "no reviews" for a shop it has not asked about', async () => {
    const reviews = await reads().listReviews(profile, { limit: 50 })
    // No GBP has ever connected, so Zernio queries nobody. The distinction between
    // that and "this shop has no reviews" is the whole point of the surface.
    expect(reviews.meta?.accountsQueried).toBe(0)

    const state = classifyInboxResult({
      rows: reviews.data.length,
      meta: reviews.meta,
      surface: INBOX_SURFACES.reviews,
      connectedAccounts: 0,
    })
    expect(state.state).toBe('never_connected')
    expect(state.headline).not.toMatch(/No reviews/i)
  })
})
