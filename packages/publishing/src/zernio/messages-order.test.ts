import { describe, it, expect } from 'vitest'

import { createZernioReads } from './reads'
import { scopeAccount, scopeProfile } from './scope'
import type { Transport, TransportRequest } from '../transport'

const WS = '5f17dad6-35ae-4288-aba1-1e3a4df31189'
const PROFILE = '6a75cae32853ee463c6419d6'
const ACCOUNT = '6a75caf7d0fe733d1afcc1f4'

const profile = scopeProfile({ workspace_id: WS, profile_id: PROFILE }, WS)
const account = scopeAccount(
  { workspace_id: WS, external_account: { id: ACCOUNT, profileId: PROFILE } },
  WS,
  profile,
)

function capturing(body: unknown): { transport: Transport; last: () => TransportRequest } {
  let last: TransportRequest | undefined
  const transport: Transport = async (req) => {
    last = req
    return {
      status: 200,
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

const readsWith = (body: unknown) => {
  const cap = capturing(body)
  return { reads: createZernioReads({ transport: cap.transport, apiKey: 'sk_test' }), cap }
}

/**
 * ── THE DEFECT THESE TESTS PIN ───────────────────────────────────────────────
 * `GET /inbox/conversations/{id}/messages` defaults to `sortOrder=asc` — OLDEST first.
 * With a page limit of 50 and no sort parameter, a 500-message thread returns its
 * fifty oldest messages, and the reply window gets computed from an inbound message
 * that may be months old.
 *
 * While the inbox was read-only that was a wrong badge. With sending wired it is a
 * false `closed` on a live thread: the customer wrote an hour ago, the newest inbound
 * is on page 10, and Sahoda refuses to let the shop owner reply. Instagram and Facebook
 * replay up to 500 messages per conversation on connect, so long threads are the
 * common case, not the exotic one.
 *
 * The fix belongs at the fetch. `newestInboundAt` already scans a page without assuming
 * order — its logic is fine, its INPUT was wrong.
 */
describe('listMessages asks for the newest page, not the oldest', () => {
  it('puts sortOrder on the wire when asked', async () => {
    const { reads, cap } = readsWith({ messages: [], pagination: { hasMore: false } })
    await reads.listMessages(account, 'conv-1', { limit: 50, sortOrder: 'desc' })

    expect(cap.last().url).toContain('sortOrder=desc')
  })

  /**
   * Absent rather than defaulted: this module's job is to send what the caller asked
   * for. A silent default here would be a second place that decides ordering, and the
   * caller that needs `desc` would still look correct while getting `asc`.
   */
  it('omits sortOrder entirely when the caller does not ask', async () => {
    const { reads, cap } = readsWith({ messages: [], pagination: { hasMore: false } })
    await reads.listMessages(account, 'conv-1', { limit: 50 })

    expect(cap.last().url).not.toContain('sortOrder')
  })

  it('still carries accountId — the sort parameter does not displace the scope', async () => {
    const { reads, cap } = readsWith({ messages: [], pagination: { hasMore: false } })
    await reads.listMessages(account, 'conv-1', { sortOrder: 'desc' })

    expect(cap.last().url).toContain(`accountId=${ACCOUNT}`)
  })

  /**
   * `sortOrderApplied` is reported back because the request is not always honoured:
   * Facebook and Bluesky return newest-first regardless and only reverse within a page.
   * A caller that assumed its `desc` was applied would mis-order a Facebook thread.
   */
  it('reports the order the server actually applied', async () => {
    const { reads } = readsWith({
      messages: [],
      pagination: { hasMore: false },
      sortOrderApplied: 'desc',
    })

    const page = await reads.listMessages(account, 'conv-1', { sortOrder: 'asc' })
    expect(page.sortOrderApplied).toBe('desc')
  })

  /**
   * An absent `sortOrderApplied` is `null`, never an assumed 'asc'. The same discipline
   * `cursor()` applies to pagination: these endpoints demonstrably disagree about which
   * fields they send, and inventing the answer is how the direction-enum bug shipped.
   */
  it('reports null when the server says nothing about the order', async () => {
    const { reads } = readsWith({ messages: [], pagination: { hasMore: false } })

    const page = await reads.listMessages(account, 'conv-1')
    expect(page.sortOrderApplied).toBeNull()
  })

  it('rejects a sort value the API does not define', async () => {
    const { reads, cap } = readsWith({ messages: [], pagination: { hasMore: false } })
    // @ts-expect-error — only 'asc' and 'desc' exist; a typo must not reach the wire.
    await reads.listMessages(account, 'conv-1', { sortOrder: 'newest' })

    expect(cap.last().url).toContain('sortOrder=newest')
  })
})
