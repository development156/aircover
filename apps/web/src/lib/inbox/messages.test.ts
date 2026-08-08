import type { ZernioMessage } from '@sahoda/publishing'
import { describe, it, expect } from 'vitest'

import { newestInboundAt, threadPlatform } from './messages'

const message = (over: Partial<ZernioMessage> = {}): ZernioMessage => ({
  id: 'm1',
  conversationId: 'c1',
  accountId: 'a1',
  platform: 'instagram',
  message: 'hello',
  direction: 'inbound',
  createdAt: '2026-08-08T10:00:00.000Z',
  ...over,
})

describe('newestInboundAt', () => {
  it('returns null for an empty page — a genuine "we do not know"', () => {
    expect(newestInboundAt([])).toBeNull()
  })

  it('ignores outbound messages entirely', () => {
    // Our own reply must never open a window. This is the whole reason the list view
    // cannot compute one: `updatedTime` advances on outbound too.
    const messages = [
      message({ id: 'a', direction: 'outbound', createdAt: '2026-08-08T12:00:00.000Z' }),
      message({ id: 'b', direction: 'inbound', createdAt: '2026-08-08T09:00:00.000Z' }),
    ]
    expect(newestInboundAt(messages)).toBe('2026-08-08T09:00:00.000Z')
  })

  it('returns null when the page holds only outbound messages', () => {
    expect(newestInboundAt([message({ direction: 'outbound' })])).toBeNull()
  })

  it('does not assume the page is sorted', () => {
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
    // The documented value is 'inbound'; no live payload has been observed. If Zernio
    // sends something else, every window degrades to `unknown` — which claims nothing —
    // rather than defaulting to open. See the note in messages.ts.
    expect(newestInboundAt([message({ direction: 'in' })])).toBeNull()
    expect(newestInboundAt([message({ direction: 'received' })])).toBeNull()
  })
})

describe('threadPlatform', () => {
  it('returns null for an empty page rather than picking a default', () => {
    expect(threadPlatform([])).toBeNull()
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
