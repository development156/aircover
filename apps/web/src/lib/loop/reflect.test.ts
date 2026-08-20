import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import {
  reflect,
  MIN_POSTS_PER_GROUP,
  MIN_LEADER_MEAN,
  type MetricObservation,
} from './reflect'

const obs = (
  post_id: string,
  channel: MetricObservation['channel'],
  value: number,
  measured_on = '2026-08-18',
  metric = 'impressions',
): MetricObservation => ({ post_id, channel, metric, value, measured_on })

/** n posts on one channel, all at the same value. */
function group(
  channel: MetricObservation['channel'],
  n: number,
  value: number,
  day = '2026-08-18',
): MetricObservation[] {
  return Array.from({ length: n }, (_, i) => obs(`${channel}-${i}`, channel, value, day))
}

describe('Reflect', () => {
  // ── THE STRUCTURAL GUARANTEE ─────────────────────────────────────────────
  it('CANNOT call a model — the module imports no mesh and holds no port', () => {
    // Read as source rather than asserted through a stub. A stub proves the
    // path not taken on ONE input; this proves there is no path at all, on
    // every input, including ones nobody thought to write a case for.
    const src = readFileSync(resolve(import.meta.dirname, 'reflect.ts'), 'utf8')
    const imports = [...src.matchAll(/^import .*?from '([^']+)'/gm)].map((m) => m[1])
    expect(imports).toEqual(['@sahoda/shared'])

    // COMMENTS STRIPPED FIRST. The prose above explains at length that this
    // module reaches no model, so it contains every word a naive scan would
    // flag — and the first version of this test failed on its own explanation.
    // A guard that reads documentation instead of code is checking the one part
    // of a file that cannot execute.
    const code = src
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '')
      .toLowerCase()
    // BOTH SIDES LOWERCASED. The first version folded the haystack only and
    // compared it against 'runTask', so 'runtask'.includes('runTask') was false
    // for every input and the check could never fire — a guard carrying the
    // same class of flaw as the thing it guards. A mutation that injected a
    // real runTask call walked straight through it.
    for (const forbidden of ['mesh', 'runtask', 'fetch(', 'openai', 'anthropic']) {
      expect(code.includes(forbidden)).toBe(false)
    }
  })

  // ── THE HONEST-EMPTY PATHS, EACH A DIFFERENT SENTENCE ────────────────────
  it('says NO HISTORY when nothing has ever been measured', () => {
    const r = reflect([])
    expect(r.learnings).toEqual([])
    expect(r.reason).toBe('no_history')
    // This is the flag the cycle row stores, so the report can tell "there were
    // no learnings" apart from "there was nothing to learn from".
    expect(r.skippedNoHistory).toBe(true)
  })

  it('does NOT claim no-history when history exists but is too thin', () => {
    const r = reflect(group('instagram', 2, 500))
    expect(r.learnings).toEqual([])
    expect(r.reason).toBe('too_few_posts')
    // The distinction that matters: something WAS measured.
    expect(r.skippedNoHistory).toBe(false)
  })

  it('says SINGLE GROUP when every post is on one channel', () => {
    const r = reflect(group('instagram', 6, 500))
    expect(r.reason).toBe('single_group')
    expect(r.skippedNoHistory).toBe(false)
  })

  // ── THE CASE THAT WOULD HAVE SHIPPED A FABRICATION ───────────────────────
  it('REFUSES a comparison whose runner-up is a single post — the live data shape', () => {
    // This is production as measured on 2026-08-20: five Instagram posts at 1–3
    // impressions, and exactly ONE LinkedIn post at 63. Mean-over-mean says
    // LinkedIn wins by thirty-one fold, every figure traceable to a real row,
    // and the claim is worthless.
    const live: MetricObservation[] = [
      ...group('instagram', 5, 2, '2026-08-18'),
      obs('li-0', 'linkedin', 63, '2026-08-17'),
    ]
    const r = reflect(live)
    expect(r.learnings).toEqual([])
    // Rejected for the RIGHT reason: LinkedIn never became an arm at all, so
    // there was one eligible group, not a close call between two.
    expect(r.reason).toBe('single_group')
  })

  it('REFUSES a lift between numbers too small to mean anything', () => {
    // Both arms clear the post floor. 3-against-1 is a "three-fold lift" and is
    // two very small numbers, either of which moves when someone opens their
    // own post.
    const r = reflect([...group('instagram', 4, 3), ...group('linkedin', 4, 1)])
    expect(r.learnings).toEqual([])
    expect(r.reason).toBe('numbers_too_small')
  })

  it('REFUSES a difference inside the noise', () => {
    const r = reflect([...group('instagram', 4, 100), ...group('linkedin', 4, 90)])
    expect(r.learnings).toEqual([])
    expect(r.reason).toBe('difference_too_small')
  })

  // ── THE ONE CASE THAT DOES PRODUCE A LEARNING ────────────────────────────
  it('emits a learning when all four gates clear, carrying its own evidence', () => {
    const r = reflect([
      ...group('instagram', 4, 400, '2026-08-18'),
      ...group('linkedin', 4, 100, '2026-08-19'),
    ])
    expect(r.learnings).toHaveLength(1)
    const [l] = r.learnings
    expect(l.leader).toBe('instagram')
    expect(l.runnerUp).toBe('linkedin')
    expect(l.leaderMean).toBe(400)
    expect(l.lift).toBe(4)
    // Every number the report will print is here, and every one is a division of
    // two numbers that came out of rows.
    expect(l.sampleSize).toBe(8)
    expect(l.postIds).toHaveLength(8)
    expect(l.windowDays).toBe(2)
    expect(r.reason).toBeNull()
    expect(r.skippedNoHistory).toBe(false)
  })

  it('emits at most one learning — it does not fill a quota', () => {
    const r = reflect([
      ...group('instagram', 4, 400),
      ...group('linkedin', 4, 100),
      ...group('x', 4, 50),
      ...group('gbp', 4, 20),
    ])
    // Four eligible channels, three possible pairings, ONE claim.
    expect(r.learnings).toHaveLength(1)
    expect(r.learnings[0].runnerUp).toBe('linkedin')
  })

  // ── THE COUNTING RULES ───────────────────────────────────────────────────
  it('counts a post measured on many days as ONE post', () => {
    // Three posts, each measured four times. Twelve rows, three posts — below
    // the floor of four for this arm, so nothing is emitted. If dailies were
    // counted as posts this would read as twelve and pass.
    const many = ['a', 'b', 'c'].flatMap((p) =>
      ['2026-08-16', '2026-08-17', '2026-08-18', '2026-08-19'].map((d) =>
        obs(p, 'instagram', 400, d),
      ),
    )
    const r = reflect([...many, ...group('linkedin', 3, 100)])
    // Both arms are exactly at the floor of 3, so this DOES clear — the point is
    // the counts, checked directly.
    expect(r.learnings[0].sampleSize).toBe(MIN_POSTS_PER_GROUP * 2)
  })

  it('averages a post\'s own daily readings before comparing', () => {
    const swingy = [
      obs('a', 'instagram', 1000, '2026-08-18'),
      obs('a', 'instagram', 0, '2026-08-19'),
      ...group('instagram', 2, 500),
      ...group('linkedin', 3, 100),
    ]
    const r = reflect(swingy)
    // post a averages 500, matching the other two — the leader mean is 500, not
    // dragged to 625 by counting the 1000 twice.
    expect(r.learnings[0].leaderMean).toBe(500)
  })

  it('ignores metrics it was not asked about', () => {
    const r = reflect(
      [
        ...group('instagram', 4, 400).map((o) => ({ ...o, metric: 'reach' })),
        ...group('linkedin', 4, 100).map((o) => ({ ...o, metric: 'reach' })),
      ],
      'impressions',
    )
    expect(r.reason).toBe('too_few_posts')
    // It was measured — just not this metric. Not a no-history claim.
    expect(r.skippedNoHistory).toBe(false)
  })

  it('does not divide by zero when the runner-up measured nothing', () => {
    const r = reflect([...group('instagram', 4, MIN_LEADER_MEAN * 10), ...group('linkedin', 4, 0)])
    // A zero arm produces no claim rather than an infinite one.
    expect(r.learnings).toEqual([])
    expect(r.reason).toBe('difference_too_small')
  })
})
