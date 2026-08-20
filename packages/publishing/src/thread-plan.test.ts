import { describe, it, expect } from 'vitest'
import { CONSTRAINTS, charCountFor } from '@sahoda/shared'

import { planThread, segmentLimitFor, linkWeightOf } from './thread-plan'

const X = CONSTRAINTS.x

describe('linkWeightOf', () => {
  /**
   * The weight is DERIVED from the engine, never restated. This asserts the
   * derivation against the engine's own behaviour rather than against the
   * literal 23 — a hard-coded 23 here would be the second copy the derivation
   * exists to avoid, and it would agree with a broken engine.
   */
  it('is whatever charCountFor charges a link on this channel', () => {
    expect(linkWeightOf(X)).toBe(
      charCountFor(X, { body: '', hasLink: true }) - charCountFor(X, { body: '', hasLink: false }),
    )
    expect(linkWeightOf(X)).toBeGreaterThan(0)
  })

  it('is zero on a channel that does not count links specially', () => {
    expect(linkWeightOf(CONSTRAINTS.linkedin)).toBe(0)
    expect(linkWeightOf(CONSTRAINTS.gbp)).toBe(0)
  })
})

describe('segmentLimitFor', () => {
  it('is the channel limit, less the link weight when there is a link', () => {
    expect(segmentLimitFor(X, false)).toBe(X.maxChars)
    expect(segmentLimitFor(X, true)).toBe(X.maxChars - linkWeightOf(X))
  })
})

describe('planThread', () => {
  it('plans a long body into posts that each fit', () => {
    const body = Array.from({ length: 40 }, (_, i) => `Point ${i} about the shop.`).join(' ')
    const result = planThread(X, body, false)
    if (!result.ok) throw new Error(`expected a plan, got ${result.refusal.code}`)
    expect(result.plan.segments.length).toBeGreaterThan(1)
    expect(result.plan.limit).toBe(280)
    for (const s of result.plan.segments) expect(Array.from(s).length).toBeLessThanOrEqual(280)
  })

  it('plans a short body as a single post', () => {
    const result = planThread(X, 'Open today until six.', false)
    if (!result.ok) throw new Error('expected a plan')
    expect(result.plan.segments).toEqual(['Open today until six.'])
  })

  /**
   * ── THE ONE THAT PROVES MAX_CHARS WAS ASKING THE WRONG QUESTION ───────────
   * docs/31 §6.2's second blocker: a legal three-post thread is refused by
   * `validateVariant` with MAX_CHARS before `refuseFormat` is reached. Here is
   * that exact body — over 280 as one post, fine as a thread.
   */
  it('accepts a body the whole-body limit refuses', () => {
    const body = 'A sentence about chai that runs on. '.repeat(20).trim()
    expect(charCountFor(X, { body })).toBeGreaterThan(X.maxChars)
    const result = planThread(X, body, false)
    expect(result.ok).toBe(true)
  })

  it('charges the link weight to every segment, tightening the split', () => {
    const body = 'word '.repeat(200).trim()
    const withLink = planThread(X, body, true)
    const without = planThread(X, body, false)
    if (!withLink.ok || !without.ok) throw new Error('expected plans')
    expect(withLink.plan.limit).toBeLessThan(without.plan.limit)
    expect(withLink.plan.segments.length).toBeGreaterThanOrEqual(without.plan.segments.length)
  })

  it('refuses a body with nothing written in it', () => {
    const result = planThread(X, '   \n\n ', false)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.refusal.code).toBe('THREAD_EMPTY')
  })

  /**
   * ── THE GUARD, SHOWN TO FAIL ─────────────────────────────────────────────
   * A 400-character URL has no space to break at. The splitter hard-cuts it and
   * both halves are dead links — a publish that succeeds and delivers nothing.
   * This is the failure the first draft of this file did NOT catch: it checked
   * segment length, which the hard cut satisfies by definition.
   */
  it('refuses an unbreakable token rather than cutting it in half', () => {
    const url = `https://example.com/${'a'.repeat(400)}`
    const result = planThread(X, `Read this ${url}`, false)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.refusal.code).toBe('THREAD_UNBREAKABLE')
    expect(result.refusal.message).toContain('280')
  })

  it('accepts a long token that still fits inside one post', () => {
    const url = `https://example.com/${'a'.repeat(200)}`
    expect(planThread(X, `Read this ${url}`, false).ok).toBe(true)
  })

  it('puts the hashtag tail in the last post, because that is what it is given', () => {
    const body = 'A sentence about chai. '.repeat(20).trim()
    const result = planThread(X, `${body}\n\n#chai #pune`, false)
    if (!result.ok) throw new Error('expected a plan')
    const last = result.plan.segments[result.plan.segments.length - 1]!
    expect(last).toContain('#chai #pune')
    expect(result.plan.segments.slice(0, -1).some((s) => s.includes('#chai'))).toBe(false)
  })
})
