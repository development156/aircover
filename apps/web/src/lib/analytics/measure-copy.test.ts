import { describe, expect, it } from 'vitest'

import {
  cooldownRemainingMs,
  cooldownSentence,
  measuredAgoSentence,
  roughlyAgo,
  type MeasureRun,
} from './measure-copy'

const COOLDOWN = 10 * 60 * 1000
const NOW = Date.parse('2026-09-06T12:00:00Z')

describe('measuredAgoSentence', () => {
  it('says how long ago the last pass ran', () => {
    const run: MeasureRun = { kind: 'at', atMs: NOW - 3 * 60_000 }
    expect(measuredAgoSentence(run, NOW)).toBe('Measured 3 minutes ago')
  })

  it('says nothing has been measured only when it actually READ that', () => {
    expect(measuredAgoSentence({ kind: 'never' }, NOW)).toBe('Not measured yet')
  })

  /**
   * The claim this file exists for. "Not measured yet" is a statement about the
   * reader's workspace; making it out of a failed cache read is the same defect
   * as rendering an unreadable list as an empty one.
   */
  it('never claims "not measured yet" when it could not look', () => {
    const sentence = measuredAgoSentence({ kind: 'unknown' }, NOW)
    expect(sentence).not.toMatch(/not measured yet/i)
    expect(sentence).toMatch(/cannot say/i)
  })

  it('does not round a fresh pass down to nothing', () => {
    expect(measuredAgoSentence({ kind: 'at', atMs: NOW - 5_000 }, NOW)).toBe(
      'Measured less than a minute ago',
    )
  })
})

describe('roughlyAgo', () => {
  it('is plural-correct at one', () => {
    expect(roughlyAgo(60_000)).toBe('1 minute')
    expect(roughlyAgo(2 * 60_000)).toBe('2 minutes')
    expect(roughlyAgo(60 * 60_000)).toBe('1 hour')
    expect(roughlyAgo(24 * 60 * 60_000)).toBe('1 day')
  })
})

describe('cooldownRemainingMs', () => {
  it('refuses a second pass inside the window', () => {
    const run: MeasureRun = { kind: 'at', atMs: NOW - 60_000 }
    expect(cooldownRemainingMs(run, NOW, COOLDOWN)).toBe(9 * 60_000)
  })

  it('allows one once the window has passed', () => {
    const run: MeasureRun = { kind: 'at', atMs: NOW - COOLDOWN }
    expect(cooldownRemainingMs(run, NOW, COOLDOWN)).toBe(0)
  })

  it('allows the first pass a workspace ever asks for', () => {
    expect(cooldownRemainingMs({ kind: 'never' }, NOW, COOLDOWN)).toBe(0)
  })

  /**
   * Fails OPEN, matching `lib/ops/rate-limit.ts`. This is abuse control on a
   * free, read-only pass, and locking every customer out because a cache is
   * unreachable is the worse of the two mistakes.
   */
  it('allows one when it could not read the stamp at all', () => {
    expect(cooldownRemainingMs({ kind: 'unknown' }, NOW, COOLDOWN)).toBe(0)
  })

  it('treats a stamp from the future as just now, not as licence', () => {
    expect(cooldownRemainingMs({ kind: 'at', atMs: NOW + 60_000 }, NOW, COOLDOWN)).toBe(COOLDOWN)
  })
})

describe('cooldownSentence', () => {
  it('names the wait, because "try later" is not a remedy', () => {
    expect(cooldownSentence(9 * 60_000)).toContain('9 minutes')
  })
})
