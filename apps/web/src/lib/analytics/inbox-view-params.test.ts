import { describe, expect, test } from 'vitest'

import {
  DEFAULT_INBOX_RANGE,
  inboxHrefFor,
  resolveInboxView,
} from '@/lib/analytics/inbox-view-params'

describe('resolveInboxView', () => {
  test('defaults to 30 days, no platform, no account', () => {
    expect(resolveInboxView({})).toEqual({ days: 30, platform: null, accountId: null })
  })

  test('accepts 7 and 90 as valid windows', () => {
    expect(resolveInboxView({ window: '7' }).days).toBe(7)
    expect(resolveInboxView({ window: '90' }).days).toBe(90)
  })

  test('falls back to the default rather than an invalid window', () => {
    expect(resolveInboxView({ window: '14' }).days).toBe(DEFAULT_INBOX_RANGE)
    expect(resolveInboxView({ window: 'not-a-number' }).days).toBe(DEFAULT_INBOX_RANGE)
  })

  test('carries platform and account filters through', () => {
    const view = resolveInboxView({ platform: 'instagram', account: 'acc_1' })
    expect(view.platform).toBe('instagram')
    expect(view.accountId).toBe('acc_1')
  })

  test('treats an empty filter as none, not an empty string', () => {
    const view = resolveInboxView({ platform: '', account: '' })
    expect(view.platform).toBeNull()
    expect(view.accountId).toBeNull()
  })
})

describe('inboxHrefFor', () => {
  const view = { days: 30 as const, platform: null, accountId: null }

  test('always carries tab=inbox', () => {
    expect(inboxHrefFor(view, {})).toContain('tab=inbox')
  })

  test('omits the default window from the link', () => {
    expect(inboxHrefFor(view, {})).not.toContain('window=')
  })

  test('sets a non-default window', () => {
    expect(inboxHrefFor(view, { window: '7' })).toContain('window=7')
  })

  test('keeps the platform filter when only the window changes', () => {
    const withPlatform = { days: 30 as const, platform: 'instagram', accountId: null }
    expect(inboxHrefFor(withPlatform, { window: '7' })).toContain('platform=instagram')
  })

  test('clears the platform filter when explicitly asked to', () => {
    const withPlatform = { days: 30 as const, platform: 'instagram', accountId: null }
    expect(inboxHrefFor(withPlatform, { platform: undefined })).not.toContain('platform=')
  })
})
