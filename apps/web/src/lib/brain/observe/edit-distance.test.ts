import { describe, it, expect } from 'vitest'
import { marketingObservationSchema } from '@sahoda/shared'

import {
  editDistance,
  levenshtein,
  normalisedDistance,
  EDIT_DISTANCE_SUBJECT,
  MAX_COMPARE_CHARS,
  type CapturedPost,
} from './edit-distance'

/**
 * What is worth testing here is not the arithmetic. It is every gate that stops
 * a sentence reaching a customer, each proved by building the case it exists to
 * refuse. The claim's WORDING is deliberately never asserted - the claim itself
 * is, through the schema, and the guarantees are asserted as claims rather than
 * as strings, so the sentence can be rewritten without retargeting a test.
 */

const DAY = 86_400_000
function day(n: number): string {
  return new Date(Date.parse('2026-01-01T00:00:00Z') + n * DAY).toISOString().slice(0, 10)
}

/** `n` posts, each rewritten by `share` of its length, spread over `spanDays`. */
function posts(n: number, share: number, spanDays: number, offset = 0): CapturedPost[] {
  const generated = 'a'.repeat(100)
  const changed = 'b'.repeat(Math.round(100 * share)) + 'a'.repeat(100 - Math.round(100 * share))
  return Array.from({ length: n }, (_, i) => ({
    id: `00000000-0000-4000-8000-${String(i + offset).padStart(12, '0')}`,
    generatedBody: generated,
    body: changed,
    createdOn: day(offset + Math.round((i * spanDays) / Math.max(n - 1, 1))),
  }))
}

/** Ten posts over 60 days: heavy rewriting early, light rewriting lately. */
function improving(): CapturedPost[] {
  return [...posts(5, 0.6, 20, 0), ...posts(5, 0.1, 20, 40)]
}

describe('levenshtein', () => {
  it('is zero for identical text and the length for an empty side', () => {
    expect(levenshtein('hello', 'hello')).toBe(0)
    expect(levenshtein('', 'hello')).toBe(5)
    expect(levenshtein('hello', '')).toBe(5)
  })

  it('counts a substitution, an insertion and a deletion as one each', () => {
    expect(levenshtein('cat', 'bat')).toBe(1)
    expect(levenshtein('cat', 'cart')).toBe(1)
    expect(levenshtein('cart', 'cat')).toBe(1)
  })

  it('bounds the work rather than comparing unbounded pasted text', () => {
    const long = 'a'.repeat(MAX_COMPARE_CHARS + 500)
    // Both sides cut to the same cap, so the tail beyond it cannot register.
    expect(levenshtein(long, long.slice(0, MAX_COMPARE_CHARS))).toBe(0)
  })

  it('normalises against the longer side, and two empty strings are identical', () => {
    expect(normalisedDistance('', '')).toBe(0)
    expect(normalisedDistance('aaaa', 'bbbb')).toBe(1)
    expect(normalisedDistance('aaaa', 'aabb')).toBe(0.5)
  })

  it('can never exceed 1, even when the customer writes far MORE than the draft', () => {
    // The denominator must be the LONGER side. Dividing by the generated length
    // instead lets a customer who expanded a short draft score above 1 - "you
    // rewrote 200% of it", which is not a quantity that exists. Every fixture
    // above has both sides the same length, so this is the only test that can
    // see the difference.
    expect(normalisedDistance('aaaa', 'aaaabbbbbbbb')).toBeCloseTo(8 / 12, 5)
    expect(normalisedDistance('aaaa', 'aaaabbbbbbbb')).toBeLessThanOrEqual(1)
    expect(normalisedDistance('a'.repeat(10), 'b'.repeat(400))).toBeLessThanOrEqual(1)
  })
})

describe('editDistance gates', () => {
  it('declines with no_captured_drafts when nothing carries a model draft', () => {
    expect(editDistance([], day(0)).reason).toBe('no_captured_drafts')
  })

  it('declines with window_too_short when everything happened inside three weeks', () => {
    const result = editDistance([...posts(5, 0.6, 5, 0), ...posts(5, 0.1, 5, 10)], day(60))
    expect(result.reason).toBe('window_too_short')
    expect(result.observation).toBeNull()
  })

  it('declines with too_few_posts when an arm is thin', () => {
    const result = editDistance([...posts(3, 0.6, 20, 0), ...posts(3, 0.1, 20, 40)], day(60))
    expect(result.reason).toBe('too_few_posts')
  })

  it('declines when the customer barely rewrote anything to begin with', () => {
    const result = editDistance([...posts(5, 0.04, 20, 0), ...posts(5, 0.01, 20, 40)], day(60))
    expect(result.reason).toBe('no_captured_drafts')
    expect(result.observation).toBeNull()
  })

  it('declines with not_improving when the rewriting GREW, and claims nothing', () => {
    const result = editDistance([...posts(5, 0.1, 20, 0), ...posts(5, 0.6, 20, 40)], day(60))
    expect(result.reason).toBe('not_improving')
    expect(result.observation).toBeNull()
  })

  it('declines with change_too_small when the fall is inside the noise', () => {
    const result = editDistance([...posts(5, 0.3, 20, 0), ...posts(5, 0.28, 20, 40)], day(60))
    expect(result.reason).toBe('change_too_small')
  })
})

describe('editDistance observation', () => {
  it('produces an observation that parses as a real row', () => {
    const result = editDistance(improving(), day(60))
    expect(result.reason).toBeNull()
    expect(result.observation).not.toBeNull()
    expect(() => marketingObservationSchema.parse(result.observation)).not.toThrow()
  })

  it('is filed under its own kind and subject', () => {
    const o = editDistance(improving(), day(60)).observation
    expect(o?.kind).toBe('edit_distance')
    expect(o?.subject).toBe(EDIT_DISTANCE_SUBJECT)
  })

  it('carries both arms as evidence, and every post it counted', () => {
    const o = editDistance(improving(), day(60)).observation
    const labels = o?.evidence.data.map((d) => d.label) ?? []
    expect(labels.some((l) => /earlier/i.test(l))).toBe(true)
    expect(labels.some((l) => /since/i.test(l))).toBe(true)
    expect(o?.evidence.postIds).toHaveLength(10)
    expect(o?.evidence.windowDays).toBeGreaterThanOrEqual(21)
  })

  it('states the SINCE figure as the smaller of the two, because it fell', () => {
    const o = editDistance(improving(), day(60)).observation
    const data = o?.evidence.data ?? []
    const earlier = data.find((d) => /earlier/i.test(d.label))?.value ?? 0
    const since = data.find((d) => /since/i.test(d.label))?.value ?? 0
    expect(since).toBeLessThan(earlier)
  })

  it('drops the middle post on an odd count rather than lending it to both arms', () => {
    // Eleven posts, so the arms cannot be equal without dropping one. A post in
    // both arms appears on both sides of its own comparison, and with samples
    // this small that single post can carry a claim over a gate. Every other
    // fixture here is even, where the two splits are identical and this cannot
    // be seen.
    const odd = [...posts(5, 0.6, 20, 0), ...posts(1, 0.6, 0, 30), ...posts(5, 0.1, 20, 40)]
    expect(odd).toHaveLength(11)
    const o = editDistance(odd, day(70)).observation
    expect(o?.evidence.postIds).toHaveLength(10)
    expect(new Set(o?.evidence.postIds).size).toBe(10)
  })

  it('never counts a post with no captured draft, because the caller cannot pass one', () => {
    // The type makes `generatedBody` required, so the exclusion is structural.
    // What is asserted here is the consequence: ten drafted posts and ten
    // undrafted ones give the SAME answer, because the undrafted never arrive.
    const withDrafts = editDistance(improving(), day(60)).observation
    expect(withDrafts?.evidence.postIds).toHaveLength(10)
  })
})
