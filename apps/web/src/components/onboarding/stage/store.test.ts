import { describe, expect, it } from 'vitest'

import {
  canAdvance,
  capLabel,
  confidenceOf,
  DEFAULT_COLORS,
  DEFAULT_DATA,
  energyOf,
  signalCount,
  signalIds,
  type OnboardingData,
} from './store'

function data(patch: Partial<OnboardingData> = {}): OnboardingData {
  return { ...DEFAULT_DATA, colors: { ...DEFAULT_COLORS }, ...patch }
}

describe('signalIds — the count is what was actually given', () => {
  it('counts nothing on an empty flow', () => {
    expect(signalIds(data())).toEqual([])
  })

  it('does not count the three DEFAULT colours as three signals', () => {
    // The swatches always hold a value, so a count derived from `colors` alone
    // would credit every workspace with three brand-colour signals nobody gave.
    expect(signalCount(data())).toBe(0)
    expect(signalIds(data({ colorsTouched: ['Primary'] }))).toEqual(['color:Primary'])
  })

  it('holds a half-typed answer below the threshold', () => {
    expect(signalIds(data({ name: 'S' }))).toEqual([])
    expect(signalIds(data({ name: 'Sa' }))).toEqual(['name'])
    // Twelve characters is the source's floor for the positioning sentence.
    expect(signalIds(data({ what: 'we sell tea' }))).toEqual([])
    expect(signalIds(data({ what: 'we sell loose-leaf tea' }))).toEqual(['what'])
  })

  it('counts each reference, source and rival exactly once', () => {
    const d = data({
      refs: [
        { url: 'a.com', host: 'a.com', kind: 'Website' },
        { url: 'b.com', host: 'b.com', kind: 'Website' },
      ],
      sources: ['Website', 'Instagram'],
      competitors: [{ name: 'Rival', url: 'https://rival.com', kind: 'website' }],
    })
    expect(signalCount(d)).toBe(5)
  })

  /**
   * THE RESUME DEFECT THIS FILE EXISTS TO PIN.
   *
   * The source keeps a counter and a module-scope `seen` Set, persists only the
   * counter, and then re-adds every reference on resume — so `seen` is empty,
   * each one is counted a second time, and a returning user's orb, confidence
   * and dashboard number are all inflated. Deriving the count makes a resume
   * arithmetically identical to the session it resumed.
   */
  it('a resumed session counts exactly what the saved session counted', () => {
    const before = data({
      name: 'Chai & Chapters',
      audience: 'weekend readers',
      refs: [
        { url: 'https://instagram.com/x', host: 'instagram.com', kind: 'Instagram account' },
        { url: 'https://pinterest.com/y', host: 'pinterest.com', kind: 'Pinterest board' },
      ],
    })
    // A round trip through JSON is what persistence actually does to it.
    const after = JSON.parse(JSON.stringify(before)) as OnboardingData
    expect(signalCount(after)).toBe(signalCount(before))
    expect(signalCount(after)).toBe(4)
  })
})

describe('confidenceOf — derived, and never a full bar', () => {
  it('reads "Getting started" when only the name was given', () => {
    const c = confidenceOf(data({ name: 'Chai & Chapters' }))
    expect(c.pct).toBe(11)
    expect(c.label).toBe('Getting started')
  })

  /**
   * The four core answers ALONE measure 46, not 52 — `(4/16)*70 + 4*7`. So the
   * flow's three required questions do not by themselves buy a "Medium", and
   * that is the formula working: the optional steps are where the reading is
   * actually earned. Pinned as arithmetic rather than as a guess, because a
   * label asserted from intuition is how a derived number quietly becomes a
   * decorative one.
   */
  it('rises as more is actually given, and the label moves with it', () => {
    const core = data({
      name: 'Chai',
      audience: 'readers',
      what: 'a bookshop that serves chai',
      category: 'Local business',
    })
    const thin = confidenceOf(data({ name: 'Chai', audience: 'readers' }))
    const fourCore = confidenceOf(core)
    // Two more real signals is what crosses the line.
    const past = confidenceOf({ ...core, refNote: 'calm', sources: ['Website'] })

    expect(thin.pct).toBe(23)
    expect(thin.label).toBe('Getting started')
    expect(fourCore.pct).toBe(46)
    expect(fourCore.label).toBe('Getting started')
    expect(past.pct).toBe(54)
    expect(past.label).toBe('Medium')
  })

  it('never reports 100 — three minutes is not a fully understood brand', () => {
    const everything = data({
      name: 'Chai & Chapters',
      site: 'https://chaiandchapters.in',
      what: 'a neighbourhood bookshop that serves chai and hosts readings',
      category: 'Local business',
      audience: 'weekend readers in Bengaluru',
      age: '25-40',
      loc: 'Bengaluru',
      role: 'reader',
      interests: 'books, tea',
      logo: 'logo.png',
      colorsTouched: ['Primary', 'Secondary', 'Background'],
      docs: Array.from({ length: 6 }, (_, i) => ({ name: `d${i}.pdf`, size: 1000 })),
      refs: Array.from({ length: 6 }, (_, i) => ({
        url: `r${i}.com`,
        host: `r${i}.com`,
        kind: 'Website',
      })),
      refNote: 'calm, unhurried',
      sources: ['Website', 'Instagram', 'Notion'],
      competitors: [
        { name: 'Blossom', url: 'https://blossom.in', kind: 'website' },
        { name: 'Champaca', url: 'https://instagram.com/champaca', kind: 'instagram' },
      ],
    })
    const c = confidenceOf(everything)
    expect(signalCount(everything)).toBeGreaterThan(16)
    expect(c.pct).toBe(96)
    expect(c.label).toBe('High')
  })

  it('is a function of the answers alone — same answers, same number', () => {
    const d = data({ name: 'Chai', audience: 'readers', what: 'a bookshop with chai' })
    expect(confidenceOf(d)).toEqual(confidenceOf({ ...d }))
  })
})

describe('energyOf — the orb reads a different denominator on purpose', () => {
  it('uses 24, not the confidence reading’s 16', () => {
    const d = data({ name: 'Chai', audience: 'readers', what: 'a bookshop with chai' })
    expect(energyOf(d)).toBeCloseTo(3 / 24)
    expect(energyOf(d)).not.toBeCloseTo(3 / 16)
  })

  it('is clamped at 1', () => {
    const many = data({
      competitors: Array.from({ length: 40 }, (_, i) => ({
        name: `c${i}`,
        url: `https://c${i}.com`,
        kind: 'website' as const,
      })),
    })
    expect(energyOf(many)).toBe(1)
  })
})

describe('canAdvance — a wall in front of an optional question is a lie', () => {
  it('requires a name on 01', () => {
    expect(canAdvance('1', data())).toBe(false)
    expect(canAdvance('1', data({ name: 'Chai' }))).toBe(true)
  })

  it('accepts EITHER the sentence or the chip on 02', () => {
    expect(canAdvance('2', data())).toBe(false)
    expect(canAdvance('2', data({ what: 'a bookshop' }))).toBe(true)
    expect(canAdvance('2', data({ category: 'Local business' }))).toBe(true)
  })

  it('requires an audience on 03', () => {
    expect(canAdvance('3', data())).toBe(false)
    expect(canAdvance('3', data({ audience: 'readers' }))).toBe(true)
  })

  it('leaves 04, 05, 06 and the rivals step OPEN with nothing filled in', () => {
    for (const step of ['4', '5', '6', 'comp'] as const) {
      expect(canAdvance(step, data())).toBe(true)
    }
  })
})

describe('capLabel', () => {
  it('names the facet behind a namespaced signal', () => {
    expect(capLabel('color:Primary')).toBe('Brand colour')
    expect(capLabel('src:Notion')).toBe('Knowledge')
    expect(capLabel('aud')).toBe('Audience')
  })

  it('falls back rather than inventing a facet name', () => {
    expect(capLabel('something-new')).toBe('Learned')
  })
})
