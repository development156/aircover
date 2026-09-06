import { describe, expect, test } from 'vitest'

import { attachmentHref } from './attachment-href'

const base = {
  accountId: 'acc1',
  conversationId: 'conv1',
  messageId: 'msg1',
  index: 2,
  url: 'https://cdn.example/expiring.jpg',
}

describe('attachmentHref', () => {
  test('goes through the resolving route when every id is known', () => {
    expect(attachmentHref(base)).toBe(
      '/api/inbox/attachment?account=acc1&conversation=conv1&message=msg1&index=2',
    )
  })

  test('a stored row with no account id falls back to the url it holds', () => {
    expect(attachmentHref({ ...base, accountId: '' })).toBe(base.url)
  })

  test('never builds a proxy url that would ask Zernio about nothing', () => {
    expect(attachmentHref({ ...base, messageId: '' })).toBe(base.url)
    expect(attachmentHref({ ...base, conversationId: '' })).toBe(base.url)
  })
})
