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
      data: data({
        name: 'Chai & Chapters',
        audience: 'weekend readers',
        category: 'Local business',
      }),
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
      sources: ['Website', 'Instagram'],
    })
    saveState(WS, { step: '5', data: before })

    const resumed = loadState(WS)
    expect(resumed).not.toBeNull()
    expect(signalCount(resumed!.data)).toBe(signalCount(before))
    expect(signalCount(resumed!.data)).toBe(4)
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
      JSON.stringify({ step: '2', data: { name: 42, sources: [7, 'Website'] } }),
    )
    const resumed = loadState(WS)
    expect(resumed?.data.name).toBe('')
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

/**
 * A saved session predates the day competitors gained an address.
 *
 * `competitors` was `string[]` until this lane sent them to Radar. Anyone
 * mid-onboarding at that moment has a `string[]` sitting in localStorage under
 * their workspace key, and `loadState` is the only thing between that and a
 * screen that maps over `c.name`.
 *
 * Dropping those rows would be the quiet option and the wrong one: they are
 * answers a person already gave. They come back named, unwatchable until an
 * address is added, and the step says so on the card rather than pretending.
 */
describe('a session saved before competitors had an address', () => {
  it('keeps the names rather than dropping the answers', () => {
    window.localStorage.setItem(
      storageKey(WS),
      JSON.stringify({
        step: '6',
        data: { ...DEFAULT_DATA, competitors: ['Blossom', 'Champaca'] },
      }),
    )

    const resumed = loadState(WS)

    expect(resumed?.data.competitors).toEqual([
      { name: 'Blossom', url: '', kind: 'website' },
      { name: 'Champaca', url: '', kind: 'website' },
    ])
  })

  it('refuses a kind that is not one Radar can read', () => {
    // localStorage is writable by anything on the origin, so the kind coming
    // back is untrusted input. A bad one falls back to `website` rather than
    // reaching `addCompetitor`, which would refuse it.
    window.localStorage.setItem(
      storageKey(WS),
      JSON.stringify({
        step: '6',
        data: {
          ...DEFAULT_DATA,
          competitors: [{ name: 'Blossom', url: 'https://b.in', kind: 'tiktok' }],
        },
      }),
    )

    expect(loadState(WS)?.data.competitors).toEqual([
      { name: 'Blossom', url: 'https://b.in', kind: 'website' },
    ])
  })

  it('drops a row with no usable name at all', () => {
    window.localStorage.setItem(
      storageKey(WS),
      JSON.stringify({ step: '6', data: { ...DEFAULT_DATA, competitors: ['', '   ', null, 7] } }),
    )

    expect(loadState(WS)?.data.competitors).toEqual([])
  })
  /**
   * THE TWO POSITIONS THAT NO LONGER EXIST.
   *
   * `'5'` was References, which was removed, and `'6'` was Knowledge, which
   * took the number 5. Anybody part-way through the flow when this shipped is
   * holding one of those in localStorage. Falling through to the `isStepId`
   * default would send them back to the intro — their typed answers intact and
   * their PLACE gone, which reads as the product having lost the session.
   */
  it('resumes a retired position on Knowledge rather than at the intro', () => {
    for (const saved of ['5', '6']) {
      window.localStorage.setItem(
        storageKey(WS),
        JSON.stringify({ step: saved, data: { name: 'Chai & Chapters' } }),
      )
      expect(loadState(WS)?.step, `a saved step of '${saved}'`).toBe('5')
      expect(loadState(WS)?.data.name).toBe('Chai & Chapters')
    }
  })
})
