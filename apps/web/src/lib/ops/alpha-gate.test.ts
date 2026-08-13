import { describe, expect, it } from 'vitest'

import {
  ALPHA_GATE,
  GATE_STALE_AFTER_DAYS,
  ageLabel,
  codesAt,
  gateAgeDays,
  shaDrift,
  shortSha,
} from './alpha-gate'

describe('ALPHA_GATE', () => {
  it('accounts for every Alpha item exactly once, so silence cannot mean "passed"', () => {
    // THE point of the reshape. A record that lists only failures makes every
    // unlisted item read as verified, which is how six failures were once
    // discoverable but eight unknowns were not.
    const codes = ALPHA_GATE.assessments.map((a) => a.code)
    expect(codes).toEqual([
      'A1',
      'A2',
      'A3',
      'A4',
      'A5',
      'A6',
      'A7',
      'A8',
      'A9',
      'A10',
      'A11',
      'A12',
      'A13',
      'A14',
    ])
    expect(new Set(codes).size).toBe(14)
  })

  it('records the 13 Aug verdict changes', () => {
    // Pinned deliberately. These are transcriptions of somebody's judgement,
    // and an edit that quietly moved a code would change the most important
    // number on the dashboard without anything failing.
    expect(codesAt(ALPHA_GATE, 'fail')).toEqual(['A3', 'A8', 'A13', 'A14'])
    expect(codesAt(ALPHA_GATE, 'partial')).toEqual(['A2', 'A5', 'A9', 'A10', 'A12'])
    expect(codesAt(ALPHA_GATE, 'pass')).toEqual(['A1', 'A4', 'A6', 'A7', 'A11'])
    expect(ALPHA_GATE.verdict).toBe('no-ship')
  })

  it('gives every item evidence a person could go and check', () => {
    // A status with no evidence is indistinguishable from a guess, and this
    // record exists precisely because a bare number was untrustworthy.
    for (const entry of ALPHA_GATE.assessments) {
      expect(entry.evidence.length, `${entry.code} needs substantive evidence`).toBeGreaterThan(40)
    }
  })

  it('dates the re-read items separately, and leaves the rest on the sweep date', () => {
    // The eight nobody re-opened must NOT carry a fresh date — that would claim
    // a reading that never happened.
    const revised = ALPHA_GATE.assessments.filter((a) => a.revisedOn !== undefined)
    expect(revised.map((a) => a.code)).toEqual(['A2', 'A5', 'A8', 'A9', 'A10', 'A12'])
    for (const entry of revised) {
      expect(entry.revisedOn).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      expect(Date.parse(entry.revisedOn!)).toBeGreaterThan(Date.parse(ALPHA_GATE.recordedOn))
    }
  })

  it('says so, in the evidence, when an item was never re-checked', () => {
    // The failure mode this guards: a `pass` from three weeks ago reading as a
    // statement about today because nothing on screen said otherwise.
    for (const entry of ALPHA_GATE.assessments) {
      if (entry.revisedOn !== undefined) continue
      expect(entry.evidence, `${entry.code} must date its own staleness`).toContain(
        'not re-checked since',
      )
    }
  })

  it('carries provenance, a date and the commit it was audited against', () => {
    expect(ALPHA_GATE.source).not.toBe('')
    expect(ALPHA_GATE.recordedOn).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(ALPHA_GATE.auditedSha).toMatch(/^[0-9a-f]{7,40}$/)
  })

  it('names only codes that exist in the seeded Alpha stage (A1–A14)', () => {
    for (const code of [
      ...ALPHA_GATE.assessments.map((a) => a.code),
      ...ALPHA_GATE.outOfScope.map((s) => s.code),
    ]) {
      const n = Number(code.replace('A', ''))
      expect(n).toBeGreaterThanOrEqual(1)
      expect(n).toBeLessThanOrEqual(14)
    }
  })

  it('records A12 Sites as a scope decision, leaving the audit untouched', () => {
    // The point of the separate field. A12 still carries its assessed status
    // because the audit did assess it — editing that would make a dated
    // transcription say something nobody transcribed. The descope is its own
    // record, and only the RENDER subtracts one from the other.
    expect(codesAt(ALPHA_GATE, 'partial')).toContain('A12')
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

  it('states A8 as never having published live to the two platforms it names', () => {
    // Regression pin for the 13 Aug change: A8 read as a pass purely because it
    // was absent from a failure list, while every x and gbp row in
    // post_publish_logs was mode:'fixture'.
    const a8 = ALPHA_GATE.assessments.find((a) => a.code === 'A8')
    expect(a8?.status).toBe('fail')
    expect(a8?.evidence).toContain('fixture')
  })

  it('states A9 as partial on the cron interval, not on whether it runs', () => {
    const a9 = ALPHA_GATE.assessments.find((a) => a.code === 'A9')
    expect(a9?.status).toBe('partial')
    expect(a9?.evidence).toContain('*/5 * * * *')
  })
})

describe('shaDrift', () => {
  const record = { ...ALPHA_GATE, auditedSha: 'a9aad9c' }

  it('is `unknown`, never `match`, when the build recorded no SHA', () => {
    // The dangerous collapse. A build that cannot say what it is must not be
    // reported as agreeing with the audit — locally this is always the case.
    expect(shaDrift(record, undefined)).toBe('unknown')
    expect(shaDrift(record, '')).toBe('unknown')
    expect(shaDrift(record, '   ')).toBe('unknown')
  })

  it('matches a full SHA against the short one the record stores', () => {
    expect(shaDrift(record, 'a9aad9c5f4ed8244ef5a34a16aa57efd6278f76f')).toBe('match')
    expect(shaDrift(record, 'a9aad9c')).toBe('match')
  })

  it('reports drift when the deployed commit is not the audited one', () => {
    expect(shaDrift(record, '565913e0000000000000000000000000000000000')).toBe('drift')
  })
})

describe('shortSha', () => {
  it('abbreviates to the seven characters git itself uses', () => {
    expect(shortSha('a9aad9c5f4ed8244ef5a34a16aa57efd6278f76f')).toBe('a9aad9c')
    expect(shortSha('  565913e0abc  ')).toBe('565913e')
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
