import { describe, expect, it } from 'vitest'

import {
  EMPTY_LIST_FILTER,
  applyListFilter,
  listAccountOptions,
  listPlatformOptions,
} from './list-filter'
import type { InboxListRow } from './list-row'

function row(over: Partial<InboxListRow>): InboxListRow {
  return {
    id: over.id ?? 'c1',
    platform: over.platform ?? 'instagram',
    accountId: over.accountId ?? 'acc1',
    accountUsername: over.accountUsername,
    participantId: over.participantId,
    participantName: over.participantName,
    lastMessage: over.lastMessage,
    updatedTime: over.updatedTime,
    status: over.status,
    unreadCount: over.unreadCount,
    url: over.url,
    storedThreadId: over.storedThreadId,
    needsReply: over.needsReply,
  }
}

describe('listPlatformOptions', () => {
  it('lists only the platforms present in the rows, once each', () => {
    const rows = [
      row({ platform: 'instagram' }),
      row({ platform: 'instagram' }),
      row({ platform: 'whatsapp' }),
    ]
    expect(listPlatformOptions(rows)).toEqual(['instagram', 'whatsapp'])
  })

  it('returns nothing for an empty list', () => {
    expect(listPlatformOptions([])).toEqual([])
  })
})

describe('listAccountOptions', () => {
  it('lists each account once, keyed by accountId, carrying its username and platform', () => {
    const rows = [
      row({ accountId: 'a1', accountUsername: 'corner_bakery', platform: 'instagram' }),
      row({ accountId: 'a1', accountUsername: 'corner_bakery', platform: 'instagram' }),
      row({ accountId: 'a2', accountUsername: undefined, platform: 'whatsapp' }),
    ]
    expect(listAccountOptions(rows)).toEqual([
      { accountId: 'a1', accountUsername: 'corner_bakery', platform: 'instagram' },
      { accountId: 'a2', accountUsername: undefined, platform: 'whatsapp' },
    ])
  })
})

describe('applyListFilter', () => {
  const rows = [
    row({
      id: 'c1',
      platform: 'instagram',
      accountId: 'a1',
      accountUsername: 'corner_bakery',
      participantName: 'Priya Shah',
      lastMessage: 'Do you deliver to Andheri?',
      updatedTime: '2026-09-01T10:00:00.000Z',
    }),
    row({
      id: 'c2',
      platform: 'whatsapp',
      accountId: 'a2',
      accountUsername: 'corner_bakery_wa',
      participantName: 'Rahul Verma',
      lastMessage: 'Order confirmed, thanks!',
      updatedTime: '2026-09-03T10:00:00.000Z',
    }),
  ]

  it('returns every row unfiltered by default, newest first', () => {
    expect(applyListFilter(rows, EMPTY_LIST_FILTER).map((r) => r.id)).toEqual(['c2', 'c1'])
  })

  it('filters by platform', () => {
    const shown = applyListFilter(rows, { ...EMPTY_LIST_FILTER, platform: 'whatsapp' })
    expect(shown.map((r) => r.id)).toEqual(['c2'])
  })

  it('filters by account', () => {
    const shown = applyListFilter(rows, { ...EMPTY_LIST_FILTER, accountId: 'a1' })
    expect(shown.map((r) => r.id)).toEqual(['c1'])
  })

  it('searches participant name, case-insensitively', () => {
    const shown = applyListFilter(rows, { ...EMPTY_LIST_FILTER, query: 'priya' })
    expect(shown.map((r) => r.id)).toEqual(['c1'])
  })

  it('searches account username', () => {
    const shown = applyListFilter(rows, { ...EMPTY_LIST_FILTER, query: 'bakery_wa' })
    expect(shown.map((r) => r.id)).toEqual(['c2'])
  })

  it('searches the last message body', () => {
    const shown = applyListFilter(rows, { ...EMPTY_LIST_FILTER, query: 'andheri' })
    expect(shown.map((r) => r.id)).toEqual(['c1'])
  })

  it('sorts newest first by default', () => {
    const shown = applyListFilter(rows, EMPTY_LIST_FILTER)
    expect(shown.map((r) => r.id)).toEqual(['c2', 'c1'])
  })

  it('sorts oldest first when asked', () => {
    const shown = applyListFilter(rows, { ...EMPTY_LIST_FILTER, sort: 'oldest' })
    expect(shown.map((r) => r.id)).toEqual(['c1', 'c2'])
  })

  it('places rows with no updatedTime last under newest-first', () => {
    const withUnknown = [...rows, row({ id: 'c3', updatedTime: undefined })]
    const shown = applyListFilter(withUnknown, EMPTY_LIST_FILTER)
    expect(shown.map((r) => r.id)).toEqual(['c2', 'c1', 'c3'])
  })

  it('combines platform, account and query filters', () => {
    const shown = applyListFilter(rows, {
      ...EMPTY_LIST_FILTER,
      platform: 'instagram',
      accountId: 'a1',
      query: 'priya',
    })
    expect(shown.map((r) => r.id)).toEqual(['c1'])
  })
})
