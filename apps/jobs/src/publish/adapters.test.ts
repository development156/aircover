import { describe, it, expect } from 'vitest'
import { AdapterError } from '@sahoda/shared'
import { createAdapterSelector } from './adapters'

const transport = async () => ({ status: 200, body: '{}', headers: {} })

describe('createAdapterSelector', () => {
  it('returns the labelled fixture adapter for every channel in fixture mode', async () => {
    const select = createAdapterSelector({ mode: 'fixture', transport })

    for (const channel of ['x', 'gbp'] as const) {
      const adapter = select(channel)
      expect(adapter.channel).toBe(channel)
      const result = await adapter.publish({
        workspaceId: 'w',
        postId: 'p',
        variantId: 'v',
        content: channel === 'x' ? { channel: 'x', text: 'hi' } : { channel: 'gbp', summary: 'hi' },
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

    expect(select('x').channel).toBe('x')
    expect(select('gbp').channel).toBe('gbp')
  })

  it('refuses a live channel that has no adapter, rather than silently faking one', () => {
    // linkedin is publishable per the Constraint Engine but packages/publishing ships no
    // adapter for it. Downgrading to the fixture here would be mock-success in a prod path.
    const select = createAdapterSelector({ mode: 'live', transport })

    expect(() => select('linkedin')).toThrow(AdapterError)
    try {
      select('linkedin')
    } catch (e) {
      expect(e).toMatchObject({ code: 'NO_ADAPTER', classification: 'permanent' })
    }
  })

  it('refuses instagram in live mode', () => {
    const select = createAdapterSelector({ mode: 'live', transport })

    expect(() => select('instagram')).toThrow(AdapterError)
  })
})
