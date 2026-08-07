import { describe, it, expect } from 'vitest'
import { AdapterError } from '@sahoda/shared'
import { createAdapterSelector } from './adapters'

const transport = async () => ({ status: 200, body: '{}', headers: {} })

describe('createAdapterSelector', () => {
  it('returns the labelled fixture adapter for every channel in fixture mode', async () => {
    const select = createAdapterSelector({ mode: 'fixture', transport })

    for (const channel of ['x', 'gbp'] as const) {
      const adapter = select(channel, false)
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

    expect(select('x', false).channel).toBe('x')
    expect(select('gbp', false).channel).toBe('gbp')
  })

  it('refuses a live channel that has no adapter, rather than silently faking one', () => {
    // linkedin is publishable per the Constraint Engine but packages/publishing ships no
    // adapter for it. Downgrading to the fixture here would be mock-success in a prod path.
    const select = createAdapterSelector({ mode: 'live', transport })

    expect(() => select('linkedin', false)).toThrow(AdapterError)
    try {
      select('linkedin', false)
    } catch (e) {
      expect(e).toMatchObject({ code: 'NO_ADAPTER', classification: 'permanent' })
    }
  })

  it('refuses instagram when the connection is not a Zernio one', () => {
    // Instagram has no native adapter at all — we hold no Meta credential. A
    // non-Zernio connection for it is unpublishable, and must say so rather than
    // fall through to the fixture.
    const select = createAdapterSelector({ mode: 'live', transport })

    expect(() => select('instagram', false)).toThrow(AdapterError)
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
      expect(select(channel, true).channel).toBe(channel)
    }
  })

  it('refuses the rail when the key is absent, rather than faking a publish', () => {
    const select = createAdapterSelector({ mode: 'live', transport })

    expect(() => select('linkedin', true)).toThrow(AdapterError)
  })
})
