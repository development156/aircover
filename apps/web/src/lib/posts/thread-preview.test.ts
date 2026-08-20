import { describe, it, expect } from 'vitest'
import { CONSTRAINTS, formatForPlatform, publishedTextOf } from '@sahoda/shared'
import { planThread } from '@sahoda/publishing/format'

import { meterFor } from './counters'
import { asThread, previewThread } from './thread-preview'

const LONG =
  'We open at nine every morning and the chai is fresh. ' +
  'Come by for samosas at four, they sell out fast. '.repeat(5) +
  'Parking is easy on the side street behind the shop.'

const draft = (over: Record<string, unknown> = {}) => ({
  body: LONG,
  hasLink: false,
  mediaCount: 0,
  ...over,
})

describe('previewThread', () => {
  it('returns null when the version is not a thread', () => {
    expect(previewThread('x', draft(), false)).toBeNull()
  })

  it('numbers the posts and reports one post’s limit', () => {
    const preview = previewThread('x', draft(), true)!
    expect(preview.refusal).toBeNull()
    expect(preview.limit).toBe(280)
    expect(preview.segments.length).toBeGreaterThan(1)
    expect(preview.segments.map((s) => s.index)).toEqual(preview.segments.map((_, i) => i + 1))
    for (const s of preview.segments) expect(s.chars).toBeLessThanOrEqual(280)
  })

  /**
   * ── THE PREVIEW AND THE PUBLISHER MUST BE ONE ARITHMETIC ──────────────────
   * `runPublishPost` plans from `publishedTextOf(formatForPlatform(spec, draft))`.
   * If this screen planned from `state.body` instead, a version whose hashtag tail
   * spills into an extra post would show four and publish five — and the fifth
   * would be nothing but hashtags. So this asserts the two produce the SAME
   * segments, on a draft chosen so the tail actually matters.
   */
  it('plans exactly what the publish path will plan, hashtag tail included', () => {
    const d = draft({ hashtags: ['#chai', '#pune', '#samosa'] })
    const preview = previewThread('x', d, true)!

    const spec = CONSTRAINTS.x
    const published = publishedTextOf(formatForPlatform(spec, d))
    const planned = planThread(spec, published)
    if (!planned.ok) throw new Error('expected a plan')

    expect(preview.segments.map((s) => s.text)).toEqual(planned.plan.segments)
    // And the tail really is in there — otherwise this test agrees about nothing.
    expect(preview.segments.at(-1)!.text).toContain('#chai')
  })

  it('tightens the limit when the body carries a link', () => {
    const withLink = previewThread('x', draft({ body: `${LONG} https://example.com/x` }), true)!
    const without = previewThread('x', draft(), true)!
    expect(withLink.limit).toBeLessThan(without.limit)
  })

  /**
   * ── THE DISAGREEMENT THIS TEST EXISTS TO CATCH ────────────────────────────
   * The first draft passed `draft.hasLink` into the plan. That flag is set by
   * apps/web's `detect-link` and is NEVER set at publish time — `store.ts`
   * declines to copy a 300-line TLD list into apps/jobs and says so. So the
   * editor split at 257 and the publisher split at 280: a preview showing five
   * posts and a publish producing four, on the exact bodies a small business
   * writes, since almost every promotion carries a link.
   *
   * `draft.hasLink` is set to the WRONG value here on purpose. The plans must
   * still match, because neither side is allowed to read it.
   */
  it('splits identically to the publisher even when hasLink disagrees', () => {
    const body = `${LONG} Book here https://example.com/booking`
    const spec = CONSTRAINTS.x

    for (const flag of [true, false, undefined]) {
      const d = draft({ body, hasLink: flag })
      const preview = previewThread('x', d, true)!
      const published = publishedTextOf(formatForPlatform(spec, d))
      const planned = planThread(spec, published)
      if (!planned.ok) throw new Error('expected a plan')
      expect(preview.segments.map((s) => s.text)).toEqual(planned.plan.segments)
    }
  })

  it('carries the publish path’s own refusal code and words', () => {
    const preview = previewThread(
      'x',
      draft({ body: `Read this https://example.com/${'a'.repeat(400)}` }),
      true,
    )!
    expect(preview.refusal?.code).toBe('THREAD_UNBREAKABLE')
    expect(preview.segments).toEqual([])
  })
})

describe('asThread', () => {
  it('leaves an ordinary post’s meter untouched', () => {
    const meter = meterFor('x', draft())
    expect(asThread(meter, null)).toBe(meter)
  })

  /**
   * The defect this exists to prevent: a legal seven-post thread rendering a red
   * card and a "Trim to fit" button, telling the writer to cut words that do not
   * need cutting.
   */
  it('drops MAX_CHARS, because for a thread it is the wrong question', () => {
    const d = draft()
    const before = meterFor('x', d)
    expect(before.violations.some((v) => v.code === 'MAX_CHARS')).toBe(true)

    const after = asThread(before, previewThread('x', d, true))
    expect(after.violations.some((v) => v.code === 'MAX_CHARS')).toBe(false)
    expect(after.over).toBe(false)
  })

  /**
   * ── AND IT DROPS EXACTLY ONE CODE ────────────────────────────────────────
   * The tempting shortcut is to clear the violation list for threads. That would
   * silently widen the guard while appearing to narrow it, on the last screen the
   * writer reads before publishing. Instagram is used because it is the channel
   * with the most other rules to lose.
   */
  it('keeps every other violation standing', () => {
    const d = draft({ mediaCount: 0 })
    const before = meterFor('instagram', d)
    const kept = before.violations.filter((v) => v.code !== 'MAX_CHARS').map((v) => v.code)
    expect(kept).toContain('MEDIA_REQUIRED')

    const after = asThread(before, previewThread('instagram', d, true))
    expect(after.violations.map((v) => v.code)).toEqual(kept)
  })

  it('measures the thread against ONE post — the longest one', () => {
    const d = draft()
    const preview = previewThread('x', d, true)!
    const after = asThread(meterFor('x', d), preview)
    expect(after.maxChars).toBe(preview.limit)
    expect(after.charCount).toBe(Math.max(...preview.segments.map((s) => s.chars)))
    expect(after.charCount).toBeLessThanOrEqual(after.maxChars)
  })

  it('turns red on a thread that cannot be split, with the publisher’s words', () => {
    const d = draft({ body: `Read this https://example.com/${'a'.repeat(400)}` })
    const after = asThread(meterFor('x', d), previewThread('x', d, true))
    expect(after.over).toBe(true)
    expect(after.violations.some((v) => v.code === 'THREAD_UNBREAKABLE')).toBe(true)
  })
})
