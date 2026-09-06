import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

/**
 * APPLYING A GENERATED VERSION FILLS THE KEYWORDS, WITHOUT WIPING TYPED ONES.
 *
 * The model already writes per-channel search keywords, and the composer used to
 * throw them away: `applyGenerated` set only the body, so a writer who pressed
 * "Adapt for N channels" got fresh copy and an empty keyword box, and had to
 * retype what the model had just chosen. Now the keywords ride along — but only
 * when the model returned some. An empty list (GBP is told to produce none) must
 * never erase keywords a person typed by hand.
 */

vi.mock('@/app/actions/posts', () => ({
  saveVariant: () => Promise.resolve({ ok: true, version: 1 }),
  setVariantFormat: () => Promise.resolve({ ok: true, format: null }),
}))

const { useVariants } = await import('@/components/posts/use-variants')

const hook = () => renderHook(() => useVariants(() => 'p1', [], { supported: false }, ''))

describe('applyGenerated — keywords arrive with the generated version', () => {
  it('fills the channel keywords from the ones the model wrote', () => {
    const { result } = hook()

    act(() => {
      result.current.applyGenerated([
        {
          channel: 'x',
          body: 'Fresh mangoes this week.',
          charCount: 24,
          hashtags: ['mangoes in pune', 'monsoon fruit'],
        },
      ])
    })

    expect(result.current.states.x.body).toBe('Fresh mangoes this week.')
    expect(result.current.states.x.extras.hashtags).toEqual(['mangoes in pune', 'monsoon fruit'])
    // A generated version is a real, unsaved edit for this channel.
    expect(result.current.states.x.dirty).toBe(true)
    expect(result.current.states.x.following).toBe(false)
  })

  it('does NOT wipe keywords when the next generated version returns none', () => {
    const { result } = hook()

    act(() => {
      result.current.applyGenerated([
        { channel: 'x', body: 'First.', charCount: 6, hashtags: ['kept keyword'] },
      ])
    })
    // A later apply with no keywords (empty array) updates the body but must
    // leave the keyword the writer is now relying on in place.
    act(() => {
      result.current.applyGenerated([{ channel: 'x', body: 'Second.', charCount: 7, hashtags: [] }])
    })

    expect(result.current.states.x.body).toBe('Second.')
    expect(result.current.states.x.extras.hashtags).toEqual(['kept keyword'])
  })

  it('does NOT wipe keywords when the variant carries no keyword field at all', () => {
    const { result } = hook()

    act(() => {
      result.current.applyGenerated([
        { channel: 'x', body: 'First.', charCount: 6, hashtags: ['kept keyword'] },
      ])
    })
    act(() => {
      // No `hashtags` key — an older shape, or a channel the model skipped.
      result.current.applyGenerated([{ channel: 'x', body: 'Third.', charCount: 6 }])
    })

    expect(result.current.states.x.body).toBe('Third.')
    expect(result.current.states.x.extras.hashtags).toEqual(['kept keyword'])
  })
})
