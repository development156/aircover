import type { ZernioMessage } from '@sahoda/publishing'
import { describe, it, expect } from 'vitest'

import { newestInboundAt, threadPlatform } from './messages'

/**
 * ── WHY THIS FILE WAS REWRITTEN, NOT EXTENDED ────────────────────────────────
 * The previous version built every message with `direction: 'inbound'` and the
 * implementation matched on `'inbound'`. Both were reading doc 13; neither had seen a
 * payload. So the suite was green against code that could not work, and a comment where
 * the failure should have been said as much: "if Zernio sends something else, every
 * window degrades to unknown".
 *
 * It does send something else. `[LIVE 2026-08-10]` — `'incoming'` / `'outgoing'`.
 *
 * The default below is now the value Zernio actually sends, so a regression to the
 * documented spelling fails here rather than passing quietly.
 */

/** Verbatim from the first real Instagram thread, `fixtures/zernio-inbox/messages.instagram.json`. */
const LIVE_THREAD: ZernioMessage[] = [
  {
    id: 'aWdfZAG1faXRlbToxOklHTWVzc2FnZAUlEOjE3O…OjMyOTQ5NTQyMDA0ODIzNTM1MTIzOTg1NDkwMzUwNDQwNDQ4',
    conversationId: '1580525030139202',
    accountId: '6a75caf7d0fe733d1afcc1f4',
    platform: 'instagram',
    message: 'HI',
    senderId: '17841442795466852',
    senderName: 'You',
    direction: 'outgoing',
    createdAt: '2026-08-08T14:10:51.201Z',
    isDeleted: false,
  },
  {
    id: 'aWdfZAG1faXRlbToxOklHTWVzc2FnZAUlEOjE3O…OjMyOTQ5NTQyMjQ3OTk3MDU2MzQ2MTMwOTI3Mjc0OTUwNjU2',
    conversationId: '1580525030139202',
    accountId: '6a75caf7d0fe733d1afcc1f4',
    platform: 'instagram',
    message: 'Hi',
    senderId: '1580525030139202',
    senderName: 'Priya S.',
    direction: 'incoming',
    createdAt: '2026-08-08T14:11:04.384Z',
    isDeleted: false,
  },
]

const message = (over: Partial<ZernioMessage> = {}): ZernioMessage => ({
  id: 'm1',
  conversationId: 'c1',
  accountId: 'a1',
  platform: 'instagram',
  message: 'hello',
  direction: 'incoming',
  createdAt: '2026-08-08T10:00:00.000Z',
  ...over,
})

describe('newestInboundAt against the first real thread', () => {
  it('finds the customer’s message in a live payload', () => {
    // The assertion the old suite could not make. Before the fix this returned null,
    // and every reply affordance in the product rendered `unknown` forever.
    expect(newestInboundAt(LIVE_THREAD)).toBe('2026-08-08T14:11:04.384Z')
  })

  it('does not mistake our own outgoing message for the customer’s', () => {
    const oursOnly = LIVE_THREAD.filter((m) => m.direction === 'outgoing')
    expect(oursOnly).toHaveLength(1)
    expect(newestInboundAt(oursOnly)).toBeNull()
  })
})

describe('newestInboundAt', () => {
  it('returns null for an empty page — a genuine "we do not know"', () => {
    expect(newestInboundAt([])).toBeNull()
  })

  it('ignores our own replies entirely', () => {
    // Our own reply must never open a window. This is the whole reason the list view
    // cannot compute one: `updatedTime` advances on outgoing too.
    const messages = [
      message({ id: 'a', direction: 'outgoing', createdAt: '2026-08-08T12:00:00.000Z' }),
      message({ id: 'b', direction: 'incoming', createdAt: '2026-08-08T09:00:00.000Z' }),
    ]
    expect(newestInboundAt(messages)).toBe('2026-08-08T09:00:00.000Z')
  })

  it('returns null when the page holds only our own replies', () => {
    expect(newestInboundAt([message({ direction: 'outgoing' })])).toBeNull()
  })

  it('also accepts doc 13’s spelling, which the wire has never used', () => {
    // Tolerated, not relied on. Kept so a future platform using the documented word is
    // not a second outage; the live value above is what the default exercises.
    expect(newestInboundAt([message({ direction: 'inbound' })])).toBe('2026-08-08T10:00:00.000Z')
    expect(newestInboundAt([message({ direction: 'outbound' })])).toBeNull()
  })

  it('does not assume the page is sorted', () => {
    // Zernio reports `sortOrderApplied: "asc"` [LIVE 2026-08-10], so the newest is last
    // today. Scanning rather than indexing keeps that a convenience, not a dependency.
    const messages = [
      message({ id: 'a', createdAt: '2026-08-08T09:00:00.000Z' }),
      message({ id: 'b', createdAt: '2026-08-08T14:00:00.000Z' }),
      message({ id: 'c', createdAt: '2026-08-08T11:00:00.000Z' }),
    ]
    expect(newestInboundAt(messages)).toBe('2026-08-08T14:00:00.000Z')
  })

  it('skips unparseable and missing timestamps rather than throwing', () => {
    const messages = [
      message({ id: 'a', createdAt: 'yesterday' }),
      message({ id: 'b', createdAt: undefined }),
      message({ id: 'c', createdAt: '2026-08-08T08:00:00.000Z' }),
    ]
    expect(newestInboundAt(messages)).toBe('2026-08-08T08:00:00.000Z')
  })

  it('returns null — never a fabricated timestamp — when every inbound one is unreadable', () => {
    expect(newestInboundAt([message({ createdAt: 'nonsense' })])).toBeNull()
  })

  it('returns null for a direction value we do not recognise', () => {
    // An unseen third spelling must not open a window. `messageDirection` also logs it,
    // so a Facebook thread that speaks differently is findable rather than silent.
    expect(newestInboundAt([message({ direction: 'in' })])).toBeNull()
    expect(newestInboundAt([message({ direction: 'received' })])).toBeNull()
    expect(newestInboundAt([message({ direction: undefined })])).toBeNull()
  })
})

describe('threadPlatform', () => {
  it('returns null for an empty page rather than picking a default', () => {
    expect(threadPlatform([])).toBeNull()
  })

  it('reads instagram off the live thread', () => {
    expect(threadPlatform(LIVE_THREAD)).toBe('instagram')
  })

  it('reads the platform off the messages', () => {
    expect(threadPlatform([message({ platform: 'whatsapp' })])).toBe('whatsapp')
  })

  it('returns null for a platform outside the modelled set', () => {
    // A thread must never silently inherit Instagram's reply rules because we could not
    // read its platform.
    expect(threadPlatform([message({ platform: 'mastodon' })])).toBeNull()
  })

  it('skips unrecognised platforms to find one it does model', () => {
    const messages = [message({ platform: 'mastodon' }), message({ platform: 'facebook' })]
    expect(threadPlatform(messages)).toBe('facebook')
  })
})
