import { describe, expect, it } from 'vitest'

import { ALPHA_GATE, GATE_STALE_AFTER_DAYS, ageLabel, gateAgeDays } from './alpha-gate'

describe('ALPHA_GATE', () => {
  it('records six failing Alpha items', () => {
    // Pinned deliberately. This constant is a transcription of somebody's
    // judgement, and an edit that quietly drops a code would shrink the most
    // important number on the dashboard without anything failing.
    expect(ALPHA_GATE.failingCodes).toEqual(['A3', 'A5', 'A9', 'A12', 'A13', 'A14'])
    expect(ALPHA_GATE.verdict).toBe('no-ship')
  })

  it('carries provenance and a date, because it is not a live check', () => {
    expect(ALPHA_GATE.source).not.toBe('')
    expect(ALPHA_GATE.recordedOn).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('names only codes that exist in the seeded Alpha stage (A1–A14)', () => {
    for (const code of [...ALPHA_GATE.failingCodes, ...ALPHA_GATE.outOfScope.map((s) => s.code)]) {
      const n = Number(code.replace('A', ''))
      expect(n).toBeGreaterThanOrEqual(1)
      expect(n).toBeLessThanOrEqual(14)
    }
  })

  it('records A12 Sites as a scope decision, leaving the audit untouched', () => {
    // The point of the separate field. A12 is still in `failingCodes` because
    // the 25 Jul audit did find it failing — editing that would make a dated
    // transcription say something nobody transcribed. The descope is its own
    // record, and only the RENDER subtracts one from the other.
    expect(ALPHA_GATE.failingCodes).toContain('A12')
    expect(ALPHA_GATE.outOfScope.map((s) => s.code)).toEqual(['A12'])
  })

  it('gives every descope its own date and a reason, never a bare code', () => {
    // A code with no reason is indistinguishable from a code someone deleted to
    // make the number smaller.
    for (const entry of ALPHA_GATE.outOfScope) {
      expect(entry.decidedOn).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      expect(entry.reason.length).toBeGreaterThan(20)
    }
  })

  it('dates the descope separately from the audit it post-dates', () => {
    for (const entry of ALPHA_GATE.outOfScope) {
      expect(Date.parse(entry.decidedOn)).toBeGreaterThan(Date.parse(ALPHA_GATE.recordedOn))
    }
  })
})

describe('gateAgeDays', () => {
  const record = { ...ALPHA_GATE, recordedOn: '2026-07-25' }

  it('counts whole days from the recording date', () => {
    expect(gateAgeDays(record, new Date('2026-07-26T09:00:00Z'))).toBe(1)
    expect(gateAgeDays(record, new Date('2026-07-30T23:00:00Z'))).toBe(5)
  })

  it('clamps a future recording to 0 rather than reporting negative days', () => {
    expect(gateAgeDays(record, new Date('2026-07-24T00:00:00Z'))).toBe(0)
  })

  it('is 0, not NaN, when the date cannot be parsed', () => {
    expect(gateAgeDays({ ...record, recordedOn: 'soon' }, new Date('2026-07-26T00:00:00Z'))).toBe(0)
  })

  it('goes stale on a sprint clock, not a calendar one', () => {
    // Two days. Work lands fast enough here that a three-day-old "NO-SHIP"
    // misleads exactly as much as a three-day-old "ready".
    expect(GATE_STALE_AFTER_DAYS).toBe(2)
    expect(gateAgeDays(record, new Date('2026-07-28T00:00:00Z'))).toBeGreaterThan(
      GATE_STALE_AFTER_DAYS,
    )
  })
})

describe('ageLabel', () => {
  it.each([
    [0, 'today'],
    [1, 'yesterday'],
    [4, '4 days ago'],
  ])('%i → %s', (days, expected) => {
    expect(ageLabel(days)).toBe(expected)
  })
})
