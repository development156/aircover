import { describe, it, expect } from 'vitest'
import { AdapterError } from '@sahoda/shared'
import { createAdapterSelector } from './adapters'
import { createConnectionResolver } from './tokens'

const transport = async () => ({ status: 200, body: '{}', headers: {} })

describe('createAdapterSelector', () => {
  it('returns the labelled fixture adapter for every channel in fixture mode', async () => {
    const select = createAdapterSelector({ mode: 'fixture', transport })

    for (const channel of ['x', 'gbp'] as const) {
      const adapter = select(channel, false, null)
      expect(adapter.channel).toBe(channel)
      const result = await adapter.publish({
        workspaceId: 'w',
        postId: 'p',
        variantId: 'v',
        content:
          channel === 'x'
            ? { channel: 'x', text: 'hi', media: [] }
            : { channel: 'gbp', summary: 'hi', media: [] },
        media: [],
        auth: { connectionId: 'c', accessToken: 't', externalAccountId: 'a' },
      })
      // Never presented as a real publish.
      expect(result.mode).toBe('fixture')
      expect(result.permalink.startsWith('fixture://')).toBe(true)
    }
  })

  it('returns the real X and GBP adapters in live mode', () => {
    const select = createAdapterSelector({ mode: 'live', transport })

    expect(select('x', false, null).channel).toBe('x')
    expect(select('gbp', false, null).channel).toBe('gbp')
  })

  it('refuses a live channel that has no adapter, rather than silently faking one', () => {
    // linkedin is publishable per the Constraint Engine but packages/publishing ships no
    // adapter for it. Downgrading to the fixture here would be mock-success in a prod path.
    const select = createAdapterSelector({ mode: 'live', transport })

    expect(() => select('linkedin', false, null)).toThrow(AdapterError)
    try {
      select('linkedin', false, null)
    } catch (e) {
      expect(e).toMatchObject({ code: 'NO_ADAPTER', classification: 'permanent' })
    }
  })

  it('refuses instagram when the connection is not a Zernio one', () => {
    // Instagram has no native adapter at all — we hold no Meta credential. A
    // non-Zernio connection for it is unpublishable, and must say so rather than
    // fall through to the fixture.
    const select = createAdapterSelector({ mode: 'live', transport })

    expect(() => select('instagram', false, null)).toThrow(AdapterError)
  })

  it('takes the Zernio rail for any channel whose connection is a Zernio one', () => {
    // The choice is a property of the CONNECTION, not the channel: the same x
    // channel resolves to the native adapter or the rail depending on which kind of
    // row the store found.
    const select = createAdapterSelector({
      mode: 'live',
      transport,
      zernioApiKey: `sk_${'a'.repeat(64)}`,
    })

    for (const channel of ['x', 'gbp', 'linkedin', 'instagram'] as const) {
      expect(select(channel, true, null).channel).toBe(channel)
    }
  })

  it('refuses the rail when the key is absent, rather than faking a publish', () => {
    const select = createAdapterSelector({ mode: 'live', transport })

    expect(() => select('linkedin', true, null)).toThrow(AdapterError)
  })
})

/**
 * The seam, composed — real resolver into real selector.
 *
 * Every unit here was correct in isolation on 2026-08-09 and the composition was still
 * broken: the store decided `viaZernio: true`, the selector read it correctly, and the
 * resolver between them dropped the field. Each unit test passed. This is the only
 * shape of test that fails.
 *
 * `createConnectionResolver` is imported rather than stubbed for exactly that reason — a
 * stub would carry whatever the test author believed the contract was, which is the
 * belief that was wrong.
 */
describe('a Zernio-fronted connection reaches the Zernio adapter', () => {
  const zernioRow = {
    connectionId: '66666666-6666-4666-8666-666666666666',
    externalAccountId: 'ig-account-1',
    status: 'active',
    sealedAccessToken: null,
    viaZernio: true,
  }
  const payload = {
    workspaceId: '22222222-2222-4222-8222-222222222222',
    postId: 'p',
    variantId: 'v',
    channel: 'instagram' as const,
    scheduledAt: '2026-07-19T10:00:00.000Z',
  }
  const ZERNIO_KEY = `sk_${'a'.repeat(64)}`

  it('does not throw NO_ADAPTER for instagram in live mode', async () => {
    const resolve = createConnectionResolver({ loadConnection: async () => zernioRow })
    const select = createAdapterSelector({ mode: 'live', transport, zernioApiKey: ZERNIO_KEY })

    const connection = await resolve(payload)

    // The exact expression runPublishPost.ts uses at its call site.
    expect(() => select(payload.channel, connection.viaZernio === true, null)).not.toThrow()
    expect(select(payload.channel, connection.viaZernio === true, null).channel).toBe('instagram')
  })

  /**
   * NON-VACUITY. Instagram must still throw when the connection genuinely is not
   * Zernio-fronted — otherwise the test above would pass on a selector that returned
   * something for everything.
   */
  it('still throws NO_ADAPTER when the connection is not Zernio-fronted', () => {
    const select = createAdapterSelector({ mode: 'live', transport, zernioApiKey: ZERNIO_KEY })
    expect(() => select('instagram', false, null)).toThrow(AdapterError)
  })

  it('still throws NO_ADAPTER when the rail is not provisioned', async () => {
    const resolve = createConnectionResolver({ loadConnection: async () => zernioRow })
    const select = createAdapterSelector({ mode: 'live', transport })
    const connection = await resolve(payload)
    expect(() => select(payload.channel, connection.viaZernio === true, null)).toThrow(AdapterError)
  })
})
