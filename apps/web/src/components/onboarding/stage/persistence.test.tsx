import { beforeEach, describe, expect, it } from 'vitest'

import {
  clearState,
  DEFAULT_COLORS,
  DEFAULT_DATA,
  loadState,
  saveState,
  signalCount,
  storageKey,
  type OnboardingData,
} from './store'

const WS = 'ws_1111'
const OTHER = 'ws_2222'

function data(patch: Partial<OnboardingData> = {}): OnboardingData {
  return { ...DEFAULT_DATA, colors: { ...DEFAULT_COLORS }, ...patch }
}

beforeEach(() => {
  window.localStorage.clear()
})

describe('save and exit → resume', () => {
  it('comes back at the step it was left on, holding the same answers', () => {
    const state = {
      step: '4' as const,
      data: data({ name: 'Chai & Chapters', audience: 'weekend readers', category: 'Local business' }),
    }
    saveState(WS, state)

    const resumed = loadState(WS)
    expect(resumed?.step).toBe('4')
    expect(resumed?.data.name).toBe('Chai & Chapters')
    expect(resumed?.data.category).toBe('Local business')
  })

  it('resumes with the SAME signal count it was saved with', () => {
    const before = data({
      name: 'Chai & Chapters',
      audience: 'weekend readers',
      refs: [
        { url: 'https://instagram.com/a', host: 'instagram.com', kind: 'Instagram account' },
        { url: 'https://pinterest.com/b', host: 'pinterest.com', kind: 'Pinterest board' },
      ],
      sources: ['Website'],
    })
    saveState(WS, { step: '5', data: before })

    const resumed = loadState(WS)
    expect(resumed).not.toBeNull()
    expect(signalCount(resumed!.data)).toBe(signalCount(before))
    expect(signalCount(resumed!.data)).toBe(5)
  })

  it('returns null for a workspace that has nothing saved', () => {
    expect(loadState(WS)).toBeNull()
  })

  /**
   * One browser, two workspaces. A single shared key would resume workspace B on
   * workspace A's step holding workspace A's answers — and then write them onto
   * B when the flow finished.
   */
  it('does not hand one workspace another workspace’s answers', () => {
    saveState(WS, { step: '3', data: data({ name: 'Chai & Chapters' }) })
    expect(loadState(OTHER)).toBeNull()
    expect(storageKey(WS)).not.toBe(storageKey(OTHER))
  })

  it('clears', () => {
    saveState(WS, { step: '2', data: data({ name: 'Chai' }) })
    clearState(WS)
    expect(loadState(WS)).toBeNull()
  })
})

describe('a saved blob is untrusted input', () => {
  it('starts at intro rather than throwing on unparseable JSON', () => {
    window.localStorage.setItem(storageKey(WS), '{not json')
    expect(loadState(WS)).toBeNull()
  })

  it('rejects a step id that is not a step', () => {
    window.localStorage.setItem(storageKey(WS), JSON.stringify({ step: 'admin', data: {} }))
    expect(loadState(WS)?.step).toBe('intro')
  })

  it('drops values of the wrong type instead of rendering them', () => {
    window.localStorage.setItem(
      storageKey(WS),
      JSON.stringify({ step: '2', data: { name: 42, refs: 'nope', sources: [7, 'Website'] } }),
    )
    const resumed = loadState(WS)
    expect(resumed?.data.name).toBe('')
    expect(resumed?.data.refs).toEqual([])
    expect(resumed?.data.sources).toEqual(['Website'])
  })

  it('keeps the default colours when the saved ones are junk', () => {
    window.localStorage.setItem(
      storageKey(WS),
      JSON.stringify({ step: '4', data: { colors: { Primary: 99 } } }),
    )
    expect(loadState(WS)?.data.colors.Primary).toBe(DEFAULT_COLORS.Primary)
  })
})
