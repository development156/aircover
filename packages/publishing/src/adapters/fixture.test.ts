import { describe, it, expect } from 'vitest'
import type { PublishRequest } from '@sahoda/shared'
import { createFixtureAdapter } from './fixture'

function fakeRequest(overrides: Partial<PublishRequest> = {}): PublishRequest {
  return {
    workspaceId: 'ws-1',
    postId: 'post-1',
    variantId: 'var-1',
    content: { channel: 'x', text: 'hello world', media: [] },
    media: [],
    auth: { connectionId: 'conn-1', accessToken: 'tok', externalAccountId: 'acct-1' },
    ...overrides,
  }
}

const FIXED_NOW = new Date('2026-07-19T00:00:00.000Z')

describe('fixture adapter — the honest labelled path', () => {
  it('reports the channel it stands in for', () => {
    expect(createFixtureAdapter('x').channel).toBe('x')
    expect(createFixtureAdapter('gbp').channel).toBe('gbp')
  })

  it('ALWAYS labels the result mode:"fixture" — never presented as real success', async () => {
    const adapter = createFixtureAdapter('x')

    const result = await adapter.publish(fakeRequest())

    expect(result.mode).toBe('fixture')
    // A live mode from the fixture path would be a lie — guard it explicitly.
    expect(result.mode).not.toBe('live')
  })

  it('returns a fixture:// permalink, never a real platform URL', async () => {
    const adapter = createFixtureAdapter('gbp')

    const result = await adapter.publish(
      fakeRequest({ content: { channel: 'gbp', summary: 'hi', media: [] } }),
    )

    expect(result.permalink.startsWith('fixture://')).toBe(true)
    expect(result.permalink).not.toContain('http')
  })

  it('produces a non-empty, deterministic platformPostId for the same request', async () => {
    const adapter = createFixtureAdapter('x')
    const req = fakeRequest()

    const a = await adapter.publish(req)
    const b = await adapter.publish(req)

    // The fixture adapter always mints one — `platformPostId` is nullable on the
    // interface because a real platform may not have issued an id yet, which cannot
    // happen here. Asserting non-null keeps that difference explicit.
    expect(a.platformPostId).not.toBeNull()
    expect(a.platformPostId ?? '').not.toHaveLength(0)
    expect(a.platformPostId).toBe(b.platformPostId)
    expect(a.permalink).toBe(b.permalink)
  })

  it('stamps publishedAt from the injected clock (deterministic, valid ISO-8601)', async () => {
    const adapter = createFixtureAdapter('x', { now: () => FIXED_NOW })

    const result = await adapter.publish(fakeRequest())

    expect(result.publishedAt).toBe('2026-07-19T00:00:00.000Z')
    expect(Number.isNaN(Date.parse(result.publishedAt))).toBe(false)
  })

  it('distinguishes different posts by permalink/id', async () => {
    const adapter = createFixtureAdapter('x')

    const one = await adapter.publish(fakeRequest({ postId: 'post-A', variantId: 'var-A' }))
    const two = await adapter.publish(fakeRequest({ postId: 'post-B', variantId: 'var-B' }))

    expect(one.platformPostId).not.toBe(two.platformPostId)
    expect(one.permalink).not.toBe(two.permalink)
  })
})
